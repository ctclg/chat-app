#!/bin/bash
cd /home/site/wwwroot
export PORT=8000
pip install --upgrade pip
pip install -r requirements.txt
gunicorn --bind=0.0.0.0:8000 --timeout 600 --worker-class uvicorn.workers.UvicornWorker main:app