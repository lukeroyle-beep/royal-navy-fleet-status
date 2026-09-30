// Administrator diagnostic only; no inputs, no receipt key access.
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
int main(void) {
 if(getuid()!=0||geteuid()!=0)return 2;
 int fd=open("/private/var/db/rnfs-broker/operation.lock",O_RDWR|O_NOFOLLOW);
 if(fd<0||flock(fd,LOCK_EX|LOCK_NB))return 1;
 printf("holding fixture lock; PID %d\n",getpid());fflush(stdout);
 sleep(300);close(fd);return 0;
}
