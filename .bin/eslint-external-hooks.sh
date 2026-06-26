#!/bin/bash

cd external-hooks && npx eslint --fix $(echo "$@" | tr " " "\n" | sed "s|^external-hooks/||g" | tr "\n" " ")
