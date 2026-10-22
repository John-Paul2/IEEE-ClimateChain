# VeriCEMS Monorepo Makefile
PYTHON ?= .venv/Scripts/python.exe

.PHONY: setup test lint benchmark demo clean deploy-testnet

setup:
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r requirements.txt
	-forge build --root contracts

test:
	$(PYTHON) -m pytest -q

deploy-testnet:
	powershell -ExecutionPolicy Bypass -File scripts/deploy_testnet.ps1

lint:
	$(PYTHON) -m py_compile ml/train.py ml/benchmark/run_benchmark.py
	$(PYTHON) scripts/honesty_lint.py

benchmark:
	$(PYTHON) -m ml.benchmark.run_benchmark

demo:
	$(PYTHON) -m backend.vericems.server

clean:
	@echo "Cleaning temporary cache files"
