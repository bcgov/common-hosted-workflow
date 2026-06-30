#!/bin/bash

cd external-ui && npx eslint --fix $(echo "$@" | tr " " "\n" | sed "s|^external-ui/||g" | tr "\n" " ")
