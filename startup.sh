#!/bin/bash
set -e
echo "Current directory: $(pwd)"
echo "Listing directory contents:"
ls -la
echo "Python version:"
python --version
echo "Pip version:"
pip --version
echo "Installing requirements..."
pip install -r requirements.txt
echo "Starting Gunicorn..."
gunicorn main:app --bind=0.0.0.0:8000 --workers=4 --worker-class=uvicorn.workers.UvicornWorker --timeout=120 --access-logfile=- --error-logfile=- --log-level=debug
