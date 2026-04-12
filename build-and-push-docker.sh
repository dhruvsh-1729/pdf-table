#!/usr/bin/env bash
set -euo pipefail

cd /home/dell/Desktop/webd/kkms/pdf_proj

sudo docker build -t dhruvsh/magazine-pdf:latest . && sudo docker push dhruvsh/magazine-pdf:latest
