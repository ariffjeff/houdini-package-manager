export VERSION = $(shell python -c "from houdini_package_manager import __version__; print(__version__)")
export NAME = HPM
export EXECUTABLE = $(NAME)-$(VERSION)

# run the app from main.py
.PHONY: run
run:
	@python main.py

# run the exe build
.PHONY: run-exe
run-exe:
	.\dist\${EXECUTABLE}\${EXECUTABLE}.exe

## create the dist build and zip, and place them in the houpm site dist folder
.PHONY: prepare
prepare:
	@echo "Building requirements.txt"
	make toml-to-req
	@echo "Updating HPM version in houpm HTML."
	make update-houpm
	@echo "Creating tagged version commit."
	@git add .
	@git commit -m "$(VERSION)"
	@git tag -a "$(VERSION)" -m "$(VERSION)"
	@echo "Finished prepare."
	@echo "Push this tagged commit to trigger the GitHub Actions workflow that creates a GitHub release with a new build, and a PyPI release."

# build app executable from python using pyinstaller
define build_executable
	@poetry run pyinstaller $(if $(filter -w,$(1)), -w,) --name="${EXECUTABLE}" --icon="Houdini_Package_Manager/resources/icons/hpm.ico" --add-data="houdini_package_manager/resources;resources" main.py
	@echo "Built: ${EXECUTABLE}"
endef

# build executable, no console
# "make build-exe TEST=0" to skip testing
.PHONY: build-exe
build-exe:
ifeq ($(TEST), )
	make test
else
	@echo "Skipping pytests."
endif
	$(call build_executable, -w)
	make zip

# build executable, with console
# "make build-exe-log TEST=0" to skip testing
.PHONY: build-exe-log
build-exe-log:
ifeq ($(TEST), )
	make test
else
	@echo "Skipping pytests."
endif
	$(call build_executable)
	make zip

# convert pyproject.toml to requirement.txt
.PHONY: toml-to-req
toml-to-req:
	@python dev/pyproject-to-requirements/convert.py .

# update HPM version html in houpm website
.PHONY: update-houpm
update-houpm:
	@powershell -Command "(Get-Content docs/index.html) \
	-replace '[0-9]+\.[0-9]+\.[0-9]+/HPM-[0-9]+\.[0-9]+\.[0-9]+.zip', '$(VERSION)/HPM-$(VERSION).zip' \
	-replace '>Download HPM [0-9]+\.[0-9]+\.[0-9]+', '>Download HPM $(VERSION)' \
	| Set-Content docs/index.html"
	@echo "Updated HPM version html in houpm website..."

.PHONY: zip
zip:
	@echo "Zipping build: ${EXECUTABLE}"
	@python -c "import shutil; shutil.make_archive('dist/${EXECUTABLE}', 'zip', 'dist/${EXECUTABLE}')"
	@echo ".zip created: ${EXECUTABLE}"

.PHONY: install
install: ## Install the poetry environment and install the pre-commit hooks
	@echo "🚀 Creating virtual environment using pyenv and poetry"
	@poetry install	
	@poetry run pre-commit install
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