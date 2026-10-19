# The judge, packaged like AWS Lambda runs it: AWS's own Node.js 24 Lambda
# image (Amazon Linux 2023) plus the C++ compiler. Locally this image includes
# the Lambda Runtime Interface Emulator, so it is invoked exactly like the real
# function:
#
#   docker compose up -d judge     (from the repo root)
#   curl -d '{...job...}' http://127.0.0.1:9001/2015-03-31/functions/function/invocations
#
# On AWS the same code runs as a zip with the compiler in a layer (judge/aws/).
FROM public.ecr.aws/lambda/nodejs:24

RUN dnf install -y gcc-c++ glibc-static libstdc++-static && dnf clean all

WORKDIR /var/task
COPY runner/runner.c /tmp/runner.c
RUN mkdir -p bin && gcc -O2 -Wall -Wextra -o bin/runner /tmp/runner.c && rm /tmp/runner.c

COPY src/ src/
COPY problems/ problems/
RUN for f in problems/*/make-tests.mjs; do node "$f"; done

# Run as a non-root user, like Lambda does, so the process limit applies
USER 1000:1000

CMD ["src/index.handler"]
