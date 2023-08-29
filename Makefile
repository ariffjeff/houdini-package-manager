.PHONY: run
run: ## main app
	@python main.py

.PHONY: run-exe
run-exe: VERSION := $(shell python -c "from houdini_package_manager import __version__; print(__version__)")
run-exe: NAME := Houdini_Package_Manager
run-exe: EXECUTABLE := $(NAME)-$(VERSION)

run-exe: ## Run exe build
	.\dist\${EXECUTABLE}\${EXECUTABLE}.exe

.PHONY: build-exe
build-exe: VERSION := $(shell python -c "from houdini_package_manager import __version__; print(__version__)")
build-exe: NAME := Houdini_Package_Manager
build-exe: EXECUTABLE := $(NAME)-$(VERSION)

build-exe: ## Build app executable from python
ifeq ($(TEST), )
	make test
else
	@echo "Skipping pytests."
endif

# build
	@pyinstaller -w --name="${EXECUTABLE}" --icon="Houdini_Package_Manager/resources/icons/hpm.ico" main.py
	@echo "Built: ${EXECUTABLE}" 
	@python -c "import shutil;\
	shutil.copytree('houdini_package_manager/resources', 'dist/${EXECUTABLE}/resources');\
	print('Copied /resources to /dist');\
	shutil.rmtree('docs/dist_hpm', ignore_errors=True);\
	print('Deleted /dist_hpm');\
	shutil.copytree('dist', 'docs/dist_hpm');\
	print('Copied /dist to /dist_hpm');\
	"

# update HPM version html in houpm website
	@echo "Updating HPM version html in houpm website..."
	@powershell -Command "(Get-Content docs/index.html) \
	-replace 'Houdini_Package_Manager-[0-9]+\.[0-9]+\.[0-9]+', 'Houdini_Package_Manager-$(VERSION)' \
	-replace 'Download HPM [0-9]+\.[0-9]+\.[0-9]+', 'Download HPM $(VERSION)' \
	| Set-Content docs/index.html"

.PHONY: zip
zip: VERSION := $(shell python -c "from houdini_package_manager import __version__; print(__version__)")
zip: NAME := Houdini_Package_Manager
zip: FILENAME := $(NAME)-$(VERSION)

zip:
	@echo "Zipping build: ${FILENAME}"
	@python -c "import shutil; shutil.make_archive('dist/${FILENAME}', 'zip', 'dist/${FILENAME}')"
	@echo ".zip created: ${FILENAME}"

.PHONY: install
install: ## Install the poetry environment and install the pre-commit hooks
	@echo "🚀 Creating virtual environment using pyenv and poetry"
	@poetry install	
	@ poetry run pre-commit install
	@poetry shell

.PHONY: check
check: ## Run code quality tools.
	@echo "🚀 Checking Poetry lock file consistency with 'pyproject.toml': Running poetry lock --check"
	@poetry lock --check
	@echo "🚀 Linting code: Running pre-commit"
	@poetry run pre-commit run -a
	@echo "🚀 Static type checking: Running mypy"
	@poetry run mypy
	@echo "🚀 Checking for obsolete dependencies: Running deptry"
	@poetry run deptry .

.PHONY: test
test: ## Test the code with pytest
	@echo "🚀 Testing code: Running pytest"
	@poetry run pytest --cov --cov-config=pyproject.toml --cov-report=xml

.PHONY: build
build: clean-build ## Build wheel file using poetry
	@echo "🚀 Creating wheel file"
	@poetry build

.PHONY: clean-build
clean-build: ## clean build artifacts
	@rm -rf dist

.PHONY: publish
publish: ## publish a release to pypi.
	@echo "🚀 Publishing: Dry run."
	@poetry config pypi-token.pypi $(PYPI_TOKEN)
	@poetry publish --dry-run
	@echo "🚀 Publishing."
	@poetry publish

.PHONY: build-and-publish
build-and-publish: build publish ## Build and publish.

.PHONY: docs-test
docs-test: ## Test if documentation can be built without warnings or errors
	@poetry run mkdocs build -s

.PHONY: docs
docs: ## Build and serve the documentation
	@poetry run mkdocs serve

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help