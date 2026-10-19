// runner: runs one program with limits and reports how it went, as one line
// of JSON on stdout. Used for both compiling and running tests.
//
//   runner <cpu_ms> <wall_ms> <mem_mb> <as_mb> <fsize_mb> <nproc> <stdin> <stdout> <stderr> -- <program> [args...]
//
// Limits (set in the child, before exec):
//   CPU time   RLIMIT_CPU (hard stop) and measured user+sys time
//   wall time  the parent kills the whole process group when it is exceeded
//   memory     RLIMIT_AS (address space) = as_mb, RLIMIT_STACK = mem_mb; peak
//              resident memory (ru_maxrss) is compared to mem_mb. The judge
//              passes as_mb = mem_mb + 64 normally, and a looser as_mb to
//              tell a crash caused by the memory cap from a real crash.
//   output     RLIMIT_FSIZE (files the program writes, including stdout)
//   processes  RLIMIT_NPROC (counts every process of this user, so it must
//              run as a non-root user to apply)
//   no core dumps, a small number of open files
//
// Network is not limited here: on AWS Lambda the function has no network at
// all (see judge/README.md).
//
// Output: {"status":"OK|TLE|MLE|RE|OLE|IE","cpuMs":N,"wallMs":N,"memoryKb":N,
//          "exitCode":N,"signal":N}
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static long long now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void set_limit(int resource, rlim_t value) {
  struct rlimit rl = { value, value };
  if (setrlimit(resource, &rl) != 0) {
    // Lower only the soft limit if the hard one can't be raised to match
    getrlimit(resource, &rl);
    if (value < rl.rlim_max || rl.rlim_max == RLIM_INFINITY) rl.rlim_cur = value;
    setrlimit(resource, &rl);
  }
}

static void redirect(const char *path, int fd, int flags) {
  int f = open(path, flags, 0644);
  if (f < 0) _exit(127);
  dup2(f, fd);
  close(f);
}

int main(int argc, char **argv) {
  if (argc < 12 || strcmp(argv[10], "--") != 0) {
    fprintf(stderr, "usage: runner cpu_ms wall_ms mem_mb as_mb fsize_mb nproc stdin stdout stderr -- prog [args]\n");
    return 2;
  }
  long cpu_ms = atol(argv[1]);
  long wall_ms = atol(argv[2]);
  long mem_mb = atol(argv[3]);
  long as_mb = atol(argv[4]);
  long fsize_mb = atol(argv[5]);
  long nproc = atol(argv[6]);
  const char *in = argv[7], *out = argv[8], *err = argv[9];
  char **prog = argv + 11;

  // Tells the parent why exec failed, if it does (the pipe closes on a
  // successful exec). A program whose static arrays don't fit in the memory
  // limit fails here with ENOMEM: that is a memory limit verdict.
  int exec_pipe[2];
  if (pipe2(exec_pipe, O_CLOEXEC) != 0) {
    perror("pipe2");
    return 2;
  }

  long long start = now_ms();
  pid_t pid = fork();
  if (pid < 0) {
    perror("fork");
    return 2;
  }
  if (pid == 0) {
    close(exec_pipe[0]);
    setpgid(0, 0); // own process group, so a timeout kills all of it
    redirect(in, STDIN_FILENO, O_RDONLY);
    redirect(out, STDOUT_FILENO, O_WRONLY | O_CREAT | O_TRUNC);
    redirect(err, STDERR_FILENO, O_WRONLY | O_CREAT | O_TRUNC);
    rlim_t mem = (rlim_t)mem_mb << 20;
    set_limit(RLIMIT_CPU, (rlim_t)(cpu_ms + 999) / 1000 + 1);
    set_limit(RLIMIT_AS, (rlim_t)as_mb << 20);
    set_limit(RLIMIT_STACK, mem);
    set_limit(RLIMIT_FSIZE, (rlim_t)fsize_mb << 20);
    set_limit(RLIMIT_NPROC, (rlim_t)nproc);
    set_limit(RLIMIT_CORE, 0);
    set_limit(RLIMIT_NOFILE, 64);
    execv(prog[0], prog);
    int e = errno;
    if (write(exec_pipe[1], &e, sizeof e) < 0) _exit(127);
    _exit(127);
  }
  close(exec_pipe[1]);

  int status = 0;
  struct rusage ru;
  int wall_exceeded = 0;
  for (;;) {
    pid_t r = wait4(pid, &status, WNOHANG, &ru);
    if (r == pid) break;
    if (r < 0 && errno != EINTR) {
      perror("wait4");
      return 2;
    }
    if (now_ms() - start > wall_ms) {
      wall_exceeded = 1;
      kill(-pid, SIGKILL);
      kill(pid, SIGKILL);
      wait4(pid, &status, 0, &ru);
      break;
    }
    struct timespec pause = { 0, 2 * 1000000 }; // 2 ms
    nanosleep(&pause, NULL);
  }
  kill(-pid, SIGKILL); // anything the program left running in its group

  int exec_errno = 0;
  if (read(exec_pipe[0], &exec_errno, sizeof exec_errno) != sizeof exec_errno) exec_errno = 0;
  close(exec_pipe[0]);

  long long wall = now_ms() - start;
  long long cpu = (long long)ru.ru_utime.tv_sec * 1000 + ru.ru_utime.tv_usec / 1000 +
                  (long long)ru.ru_stime.tv_sec * 1000 + ru.ru_stime.tv_usec / 1000;
  long memory_kb = ru.ru_maxrss; // KB on Linux
  int exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
  int sig = WIFSIGNALED(status) ? WTERMSIG(status) : 0;

  const char *verdict = "OK";
  if (exec_errno == ENOMEM) verdict = "MLE";
  else if (exec_errno != 0) verdict = "IE"; // couldn't start the program at all
  else if (sig == SIGXCPU || cpu > cpu_ms || wall_exceeded) verdict = "TLE";
  else if (memory_kb > mem_mb * 1024) verdict = "MLE";
  else if (sig == SIGXFSZ) verdict = "OLE";
  else if (sig != 0 || exit_code != 0) {
    // A failed allocation under RLIMIT_AS usually ends in std::bad_alloc
    // (abort) close to the limit: report it as memory, not a crash
    verdict = memory_kb > mem_mb * 1024 * 9 / 10 ? "MLE" : "RE";
  }

  printf("{\"status\":\"%s\",\"cpuMs\":%lld,\"wallMs\":%lld,\"memoryKb\":%ld,\"exitCode\":%d,\"signal\":%d}\n",
         verdict, cpu, wall, memory_kb, exit_code, sig);
  return 0;
}
