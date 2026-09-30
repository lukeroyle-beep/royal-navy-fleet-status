// Administrator-run diagnostic, never reachable through MCP or production broker.
#define main broker_main
#include "broker.m"
#undef main
int main(void) { @autoreleasepool { @try {
 int baselineRead=open("/private/var/db/rnfs-gate-b-canary/outside.dat",O_RDONLY|O_NOFOLLOW);
 int baselineWrite=open("/private/var/db/rnfs-gate-b-canary/outside.dat",O_WRONLY|O_NOFOLLOW);
 if(baselineRead<0||baselineWrite<0)fail(@"CANARY_BASELINE_UNAVAILABLE");close(baselineRead);close(baselineWrite);
 confine(); networkDenied();
 const char *paths[]={"/private/var/db/rnfs-gate-b-canary/outside.dat","/Users/lukesmacminim41/Documents/royal-navy-fleet-status/data/royal-navy/vessels.json","/Users/lukesmacminim41/.ssh/id_ed25519"};
 for(int i=0;i<3;i++) {int fd=open(paths[i],O_RDONLY|O_NOFOLLOW); if(fd>=0) {close(fd);fail(@"FILESYSTEM_NOT_DENIED");} if(errno!=EPERM && errno!=EACCES) fail(@"FILESYSTEM_INDETERMINATE");}
 int outside=open("/private/var/db/rnfs-gate-b-canary/outside.dat",O_WRONLY|O_NOFOLLOW); if(outside>=0){close(outside);fail(@"FILESYSTEM_WRITE_NOT_DENIED");}if(errno!=EPERM&&errno!=EACCES)fail(@"FILESYSTEM_WRITE_INDETERMINATE");
 int u=socket(AF_UNIX,SOCK_STREAM,0); if(u>=0) {struct sockaddr_un a={0};a.sun_family=AF_UNIX;strlcpy(a.sun_path,"/private/tmp/rnfs-gate-b-outside.sock",sizeof a.sun_path);int rc=connect(u,(struct sockaddr*)&a,sizeof a);int e=errno;close(u);if(rc==0||(e!=EPERM&&e!=EACCES))fail(@"UNIX_NETWORK_NOT_DENIED");} else if(errno!=EPERM&&errno!=EACCES)fail(@"UNIX_INDETERMINATE");
 int d=socket(AF_INET,SOCK_DGRAM,0);if(d>=0){struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons(9);a.sin_addr.s_addr=htonl(INADDR_LOOPBACK);int rc=(int)sendto(d,"x",1,0,(struct sockaddr*)&a,sizeof a);int e=errno;close(d);if(rc>=0||(e!=EPERM&&e!=EACCES))fail(@"UDP_NOT_DENIED");}else if(errno!=EPERM&&errno!=EACCES)fail(@"UDP_INDETERMINATE");
 puts("PASS OS filesystem and TCP/UDP/Unix network denial probes"); return 0;
 } @catch(NSException *e) {printf("INSTALLATION_DEPENDENT: %s\n",e.reason.UTF8String);return 77;} }}
