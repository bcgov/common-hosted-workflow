FROM python:3.14-alpine

WORKDIR /app

COPY ./requirements.txt /tmp/

RUN python -m pip install --upgrade pip --no-cache-dir \
    && pip install --no-cache-dir -r /tmp/requirements.txt \
    && addgroup -S appgroup \
    && adduser -S appuser -G appgroup

COPY ./src /app/src

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

ENV PY_ENV=production

CMD ["python", "src/main.py"]
