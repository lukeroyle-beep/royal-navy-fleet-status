// Gate B: native fixed-operation worker. Never executes another program.
#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonCrypto.h>
#include <sys/file.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/acl.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <pwd.h>
#include <grp.h>
#include <mach-o/dyld.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <errno.h>
#include <dirent.h>
#include <sys/un.h>
#include <crt_externs.h>
extern int sandbox_init(const char *, uint64_t, char **);
extern void sandbox_free_error(char *);
#ifndef BUNDLE
#define BUNDLE "/Library/RNFSBroker"
#define STATE "/private/var/db/rnfs-broker"
#define KEYS "/private/var/db/rnfs-broker-keys"
#endif
static NSString *const policy = @"rnfs-gate-b-v1";
static void fail(NSString *s) { @throw [NSException exceptionWithName:@"Denied" reason:s userInfo:nil]; }
static NSData *json(id x) { NSError *e=nil; NSData *d=[NSJSONSerialization dataWithJSONObject:x options:NSJSONWritingSortedKeys error:&e]; if(!d) fail(@"JSON"); return d; }
static NSString *sha(NSData *d) { unsigned char h[CC_SHA256_DIGEST_LENGTH]; CC_SHA256(d.bytes,(CC_LONG)d.length,h); NSMutableString *s=[NSMutableString string]; for(int i=0;i<32;i++) [s appendFormat:@"%02x",h[i]]; return s; }
static NSString *now(void) { return [NSString stringWithFormat:@"%.6f",[NSDate date].timeIntervalSince1970]; }
static BOOL exact(NSDictionary *d, NSArray *keys) { return [d isKindOfClass:NSDictionary.class] && [[NSSet setWithArray:d.allKeys] isEqual:[NSSet setWithArray:keys]]; }
static NSData *readfd(int fd, size_t max) { NSMutableData *d=[NSMutableData data]; char b[4096]; ssize_t n; while((n=read(fd,b,sizeof b))>0) { [d appendBytes:b length:n]; if(d.length>max) fail(@"SIZE"); } if(n<0) fail(@"READ"); return d; }
static void writefd(int fd,NSData *d) { size_t p=0; while(p<d.length) { ssize_t n=write(fd,(const char*)d.bytes+p,d.length-p); if(n<=0) fail(@"WRITE"); p+=(size_t)n; } }
static void safeStat(int fd,BOOL directory,BOOL protected, mode_t expected) {
 (void)protected; struct stat s; if(fstat(fd,&s)|| (directory ? !S_ISDIR(s.st_mode) : !S_ISREG(s.st_mode)) || (!directory && s.st_nlink!=1)) fail(@"FILE_TYPE");
#ifndef TESTING
 if(protected && (s.st_uid!=0 || (s.st_mode&022))) fail(@"OWNERSHIP");
#endif
 if(expected && (s.st_mode&0777)!=expected) fail(@"MODE");
 errno=0; acl_t a=acl_get_fd_np(fd,ACL_TYPE_EXTENDED); if(!a) { if(errno==ENOENT) return; fail(@"ACL_READ"); }
 acl_entry_t entry; errno=0; int has=acl_get_entry(a,ACL_FIRST_ENTRY,&entry); int error=errno; acl_free(a); if(has==0) fail(@"ACL"); if(has!=-1 || error!=EINVAL) fail(@"ACL_READ");
}
// Walk every component with directory descriptors: never follow a symlink.
static int directory(const char *path,BOOL protected) {
 if(path[0]!='/') fail(@"ABSOLUTE_ROOT_REQUIRED"); int fd=open("/",O_RDONLY|O_DIRECTORY); if(fd<0) fail(@"ROOT");
 for(NSString *part in [[NSString stringWithUTF8String:path] componentsSeparatedByString:@"/"]) {
  if(part.length==0) continue; if([part isEqual:@"."]||[part isEqual:@".."]) fail(@"TRAVERSAL");
  int next=openat(fd,part.fileSystemRepresentation,O_RDONLY|O_DIRECTORY|O_NOFOLLOW); close(fd); fd=next; if(fd<0) fail(@"PATH");
  safeStat(fd,YES,protected,0);
 }
 return fd;
}
static NSData *file(int dir,const char *name,BOOL protected,size_t max) {
 int fd=openat(dir,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK); if(fd<0) fail(@"INPUT"); @try {safeStat(fd,NO,protected,0); return readfd(fd,max);} @finally {close(fd);}
}
static void create(int dir,const char *name,NSData *d) {
 int fd=openat(dir,name,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW,0600); if(fd<0) fail(@"OUTPUT_EXISTS_OR_INVALID");
 @try { safeStat(fd,NO,NO,0600); writefd(fd,d); if(fsync(fd)) fail(@"SYNC"); } @finally {close(fd);}
}
static void limit(int kind,rlim_t n) { struct rlimit r={n,n}; if(setrlimit(kind,&r)) fail(@"LIMIT"); }
static void confine(void) {
 NSString *profile=@"(version 1)(deny default)(allow file-read* (subpath \"/System/Library\") (subpath \"/usr/lib\") (subpath \"" BUNDLE "\") (subpath \"" STATE "\") (subpath \"" KEYS "\"))(allow file-write* (subpath \"" STATE "/runs\") (literal \"" STATE "/operation.lock\"))(allow sysctl-read)(allow mach-lookup (global-name \"com.apple.system.logger\"))";
#ifndef TESTING
 char *error=NULL; if(sandbox_init(profile.UTF8String,0,&error)) { if(error) sandbox_free_error(error); fail(@"SANDBOX_UNAVAILABLE"); }
#else
 (void)profile; // Separate test-only binary; forbidden by production install manifest.
#endif
}
static void networkDenied(void) {
#ifndef TESTING
 for(int familyIndex=0;familyIndex<2;familyIndex++) {
  int family=familyIndex?AF_INET6:AF_INET;
  int fd=socket(family,SOCK_STREAM,0); if(fd<0) { if(errno==EPERM||errno==EACCES) continue; fail(@"NETWORK_INDETERMINATE"); }
  struct sockaddr_in v4={0}; v4.sin_len=sizeof v4; v4.sin_family=AF_INET; v4.sin_port=htons(9); v4.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
  struct sockaddr_in6 v6={0}; v6.sin6_len=sizeof v6; v6.sin6_family=AF_INET6; v6.sin6_port=htons(9); v6.sin6_addr=in6addr_loopback;
  int rc=connect(fd,familyIndex?(struct sockaddr*)&v6:(struct sockaddr*)&v4,familyIndex?sizeof v6:sizeof v4); int err=errno; close(fd);
  if(rc==0 || (err!=EPERM && err!=EACCES)) fail(@"NETWORK_NOT_DENIED");
 }
#endif
}
int main(int argc,char **argv) { @autoreleasepool {
 @try {
  (void)argv; if(argc!=1) fail(@"ARGUMENTS");
  for(int fd=3;fd<1024;fd++) close(fd);
  alarm(15); signal(SIGPIPE,SIG_IGN); umask(077);
  char **env=*_NSGetEnviron(); while(env && *env) { char *name=strdup(*env); char *eq=strchr(name,'='); if(eq) *eq=0; unsetenv(name); free(name); env=*_NSGetEnviron(); }
  limit(RLIMIT_CPU,5); limit(RLIMIT_FSIZE,1024*1024); limit(RLIMIT_NOFILE,32); limit(RLIMIT_CORE,0);
#ifndef TESTING
  struct sockaddr_un peer; socklen_t plen=sizeof peer; int type=0; socklen_t tlen=sizeof type; uid_t peeruid; gid_t peergid;
  if(getpeername(0,(struct sockaddr*)&peer,&plen)||peer.sun_family!=AF_UNIX||getsockopt(0,SOL_SOCKET,SO_TYPE,&type,&tlen)||type!=SOCK_STREAM||getpeereid(0,&peeruid,&peergid)) fail(@"TRANSPORT");
  struct passwd *pw=getpwnam("_rnfsbroker"); if(!pw || pw->pw_uid==0 || getuid()!=pw->pw_uid || geteuid()!=pw->pw_uid || getgid()!=pw->pw_gid || getegid()!=pw->pw_gid) fail(@"IDENTITY");
  gid_t gs[32]; int ng=getgroups(32,gs); if(ng<0) fail(@"GROUPS"); for(int i=0;i<ng;i++) if(gs[i]!=pw->pw_gid) fail(@"GROUPS");
#endif
  int bundle=directory(BUNDLE,YES), state=directory(STATE,YES), keys=directory(KEYS,YES);
  if(fchdir(state)) fail(@"CWD");
  NSData *cfgBytes=file(bundle,"policy.json",YES,8192); NSDictionary *cfg=[NSJSONSerialization JSONObjectWithData:cfgBytes options:0 error:nil];
  if(!exact(cfg,@[@"policyVersion",@"brokerSha256",@"fixtureSha256",@"keyId"]) || ![cfg[@"policyVersion"] isEqual:policy]) fail(@"POLICY");
  uint32_t len=4096; char exe[4096]; if(_NSGetExecutablePath(exe,&len)) fail(@"EXECUTABLE");
#ifndef TESTING
  if(strcmp(exe,BUNDLE "/broker")) fail(@"EXECUTABLE_PATH");
#endif
  NSData *binary=file(bundle,"broker",YES,16*1024*1024);
  if(![sha(binary) isEqual:cfg[@"brokerSha256"]]) fail(@"INTEGRITY");
  NSData *fixture=file(bundle,"fixture.dat",YES,65536); if(![sha(fixture) isEqual:cfg[@"fixtureSha256"]]) fail(@"FIXTURE_INTEGRITY");
  safeStat(keys,YES,YES,0750);
  NSData *key=file(keys,"receipt.key",YES,32); if(key.length!=32 || ![sha(key) isEqual:cfg[@"keyId"]]) fail(@"KEY");
  struct stat ks; if(fstatat(keys,"receipt.key",&ks,AT_SYMLINK_NOFOLLOW)|| (ks.st_mode&0777)!=0440) fail(@"KEY_MODE");
  #ifndef TESTING
  struct stat kd; if(fstat(keys,&kd)||kd.st_gid!=getgid()||ks.st_gid!=getgid()) fail(@"KEY_GROUP");
#endif
  int lock=openat(state,"operation.lock",O_RDWR|O_NOFOLLOW|O_NONBLOCK); if(lock<0) fail(@"LOCK"); safeStat(lock,NO,NO,0660);
#ifndef TESTING
  struct stat ls; if(fstat(lock,&ls)||ls.st_uid!=0) fail(@"LOCK_OWNER");
#endif
  int runs=openat(state,"runs",O_RDONLY|O_DIRECTORY|O_NOFOLLOW); if(runs<0) fail(@"RUNS"); safeStat(runs,YES,NO,0700);
#ifndef TESTING
  struct stat rs; if(fstat(runs,&rs)||rs.st_uid!=getuid()) fail(@"RUNS_OWNER");
#endif
  confine(); networkDenied();
  // One bounded line, no caller paths/options or second operation per process.
  unsigned char raw[8193]; size_t n=0; for(;;) { unsigned char c; ssize_t got=read(0,&c,1); if(got!=1) fail(@"REQUEST_EOF"); if(c=='\n') break; if(n==8192) fail(@"REQUEST_SIZE"); raw[n++]=c; }
  NSData *request=[NSData dataWithBytes:raw length:n]; NSDictionary *r=[NSJSONSerialization JSONObjectWithData:request options:0 error:nil];
  if(!exact(r,@[@"operation",@"policyVersion",@"requestId"]) || ![json(r) isEqual:request]) fail(@"SCHEMA_OR_NONCANONICAL_JSON");
  NSString *op=r[@"operation"], *rid=r[@"requestId"];
  if(![r[@"policyVersion"] isEqual:policy]) fail(@"POLICY_VERSION");
  if(![op isEqual:@"readiness_check"] && ![op isEqual:@"backup_restore_verify"]) fail(@"OPERATION");
  NSRegularExpression *rx=[NSRegularExpression regularExpressionWithPattern:@"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" options:0 error:nil];
  if(![rid isKindOfClass:NSString.class] || rid.length!=36 || [rx numberOfMatchesInString:rid options:0 range:NSMakeRange(0,rid.length)]!=1) fail(@"REQUEST_ID");
  if(flock(lock,LOCK_EX|LOCK_NB)) fail(@"BUSY");
  DIR *inventory=fdopendir(dup(runs)); if(!inventory) fail(@"CAPACITY_SCAN"); unsigned count=0; struct dirent *entry; errno=0; while((entry=readdir(inventory))) { if(strcmp(entry->d_name,".") && strcmp(entry->d_name,"..")) count++; } int scanError=errno; closedir(inventory); if(scanError) fail(@"CAPACITY_SCAN"); if(count>=256) fail(@"CAPACITY");
  NSString *started=now();
  if(mkdirat(runs,rid.UTF8String,0700)) fail(@"REPLAY_OR_RUN_INVALID");
  int run=openat(runs,rid.UTF8String,O_RDONLY|O_DIRECTORY|O_NOFOLLOW); if(run<0) fail(@"RUN");
  NSMutableDictionary *outputs=[NSMutableDictionary dictionary];
  if([op isEqual:@"backup_restore_verify"]) {
   create(run,"backup.dat",fixture); NSData *backup=file(run,"backup.dat",NO,65536);
   create(run,"restored.dat",backup); NSData *restored=file(run,"restored.dat",NO,65536);
   if(![restored isEqual:fixture]) fail(@"RESTORE_MISMATCH");
   outputs[@"backup"]=sha(backup); outputs[@"restored"]=sha(restored);
  }
  NSDictionary *result=@{@"scope":@"isolated-fixture-only",@"fixtureVerified":@YES}; outputs[@"result"]=sha(json(result));
  NSDictionary *payload=@{@"operation":op,@"requestId":rid,@"startedAtUnixSeconds":started,@"completedAtUnixSeconds":now(),@"outcome":@"PASS",@"inputHashes":@{@"request":sha(request),@"fixture":sha(fixture)},@"outputHashes":outputs,@"brokerVersion":@"1.0.0",@"brokerSha256":cfg[@"brokerSha256"],@"policyVersion":policy,@"configurationSha256":sha(cfgBytes),@"keyId":cfg[@"keyId"],@"uid":@(getuid()),@"gid":@(getgid()),@"result":result,
#ifdef TESTING
   @"enforcement":@"TEST_ONLY_UNCONFINED"
#else
   @"enforcement":@"installed-sandbox-required"
#endif
  };
  NSData *body=json(payload); unsigned char mac[32]; CCHmac(kCCHmacAlgSHA256,key.bytes,key.length,body.bytes,body.length,mac);
  NSData *receipt=json(@{@"payloadBase64":[body base64EncodedStringWithOptions:0],@"hmacSha256":[[NSData dataWithBytes:mac length:32] base64EncodedStringWithOptions:0]});
  create(run,"receipt.json",receipt); if(fsync(run)||fsync(runs)) fail(@"SYNC"); close(run);
  writefd(1,receipt); writefd(1,[@"\n" dataUsingEncoding:NSUTF8StringEncoding]);
  close(runs); close(lock); close(keys); close(state); close(bundle); return 0;
 } @catch(NSException *e) {
  NSData *d=json(@{@"outcome":@"REJECTED",@"code":[e.name isEqual:@"Denied"]?e.reason:@"INTERNAL"});
  @try {writefd(1,d); writefd(1,[@"\n" dataUsingEncoding:NSUTF8StringEncoding]);} @catch(id ignored) {} return 1;
 }
}}
