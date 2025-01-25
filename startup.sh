#!/bin/bash
cd /home/site/wwwroot
pip install -r requirements.txt
gunicorn --bind=0.0.0.0:8000 --timeout 600 --worker-class uvicorn.workers.UvicornWorker main:app