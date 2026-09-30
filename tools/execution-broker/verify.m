// Administrator-only HMAC verification. No secret on argv/stdout or in a caller runtime.
#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonCrypto.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#ifndef STATE
#define STATE "/private/var/db/rnfs-broker"
#define KEYS "/private/var/db/rnfs-broker-keys"
#endif
static NSData *readfile(const char *p,size_t max) { int fd=open(p,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(fd<0)return nil;struct stat s;if(fstat(fd,&s)||!S_ISREG(s.st_mode)||s.st_nlink!=1||s.st_size<0||(size_t)s.st_size>max){close(fd);return nil;}NSMutableData *d=[NSMutableData dataWithLength:(NSUInteger)s.st_size];ssize_t n=read(fd,d.mutableBytes,d.length);close(fd);return n==(ssize_t)d.length?d:nil; }
int main(int argc,char **argv) {@autoreleasepool{
 if(argc!=2)return 2;
#ifndef TESTING
 if(getuid()!=0||geteuid()!=0)return 2;
#endif
 NSString *rid=[NSString stringWithUTF8String:argv[1]];
 NSRegularExpression *rx=[NSRegularExpression regularExpressionWithPattern:@"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" options:0 error:nil];if(rid.length!=36||[rx numberOfMatchesInString:rid options:0 range:NSMakeRange(0,36)]!=1)return 2;
 // chdir through checked descriptors rather than following worker-controlled run symlinks.
 int root=open(STATE "/runs",O_RDONLY|O_DIRECTORY|O_NOFOLLOW);if(root<0)return 2;int run=openat(root,argv[1],O_RDONLY|O_DIRECTORY|O_NOFOLLOW);close(root);if(run<0||fchdir(run))return 2;close(run);
 NSData *k=readfile(KEYS "/receipt.key",32),*wire=readfile("receipt.json",16384);if(k.length!=32||!wire)return 2;
 NSDictionary *r=[NSJSONSerialization JSONObjectWithData:wire options:0 error:nil];if(![r isKindOfClass:NSDictionary.class]||![r[@"payloadBase64"] isKindOfClass:NSString.class]||![r[@"hmacSha256"] isKindOfClass:NSString.class])return 2;
 NSData *body=[[NSData alloc]initWithBase64EncodedString:r[@"payloadBase64"] options:0],*expected=[[NSData alloc]initWithBase64EncodedString:r[@"hmacSha256"] options:0];if(!body||expected.length!=32)return 2;
 unsigned char mac[32];CCHmac(kCCHmacAlgSHA256,k.bytes,k.length,body.bytes,body.length,mac);unsigned diff=0;for(int i=0;i<32;i++)diff|=mac[i]^((const unsigned char*)expected.bytes)[i];if(diff)return 1;
 NSDictionary *payload=[NSJSONSerialization JSONObjectWithData:body options:0 error:nil];if(![payload isKindOfClass:NSDictionary.class]||![payload[@"requestId"] isEqual:rid])return 1;
#ifndef TESTING
 if(![payload[@"enforcement"] isEqual:@"installed-sandbox-required"])return 1;
#endif
 puts("AUTHENTIC RECEIPT: check bound outcome, operation, hashes and independent scheduler provenance separately.");return 0;
}}
