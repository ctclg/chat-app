#!/bin/bash
cd /home/site/wwwroot
gunicorn main:app --config gunicorn.conf.py