.PHONY: up down destroy reset logs

DAEMON ?= false
COMPOSE_FILES = -f ./docker-compose/docker-compose.yml

# Common flags
UP_FLAGS = up --build --remove-orphans
ifeq ($(DAEMON),true)
    UP_FLAGS += -d
endif

DOWN_FLAGS = down
DESTROY_FLAGS = down --volumes --rmi all --remove-orphans
LOGS_FALGS = logs --tail=5

# Cleanup helpers
VOLUME_CLEAN = docker volume rm docker-compose_n8n_storage docker-compose_postgres_storage || true
IMAGE_PRUNE = docker image prune -f

up:
	docker compose $(COMPOSE_FILES) $(UP_FLAGS)

down:
	docker compose $(COMPOSE_FILES) $(DOWN_FLAGS)

destroy:
	docker compose $(COMPOSE_FILES) $(DESTROY_FLAGS)
	$(VOLUME_CLEAN)
	$(IMAGE_PRUNE)

reset: destroy up

logs:
	docker compose $(COMPOSE_FILES) $(LOGS_FALGS)
