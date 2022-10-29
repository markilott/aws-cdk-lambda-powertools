#!/bin/bash

echo tools layer
(cd lib/layers/powertools/nodejs && npm ci --omit=dev)