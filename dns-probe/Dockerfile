FROM python:3.11-alpine

WORKDIR /app

RUN python -m pip install --upgrade pip --no-cache-dir

COPY ./requirements.txt /tmp/

RUN pip install --no-cache-dir -r /tmp/requirements.txt

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY ./src /app/src

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

ENV PY_ENV=production

CMD ["python", "src/main.py"]
