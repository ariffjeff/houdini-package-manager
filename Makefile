export VERSION = $(shell python -c "from houdini_package_manager import __version__; print(__version__)")
export NAME = Houdini_Package_Manager
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
ifeq ($(TEST), )
	make test
else
	@echo "Skipping pytests."
endif

	make build-exe
	make zip
	make dist-move
	make update-houpm
	@echo "Finished prepare."

# build app executable from python
.PHONY: build-exe
build-exe: 
# pyinstaller must be run inside the poetry venv (via '@poetry run') for pyinstaller to access the venv dependencies
	@poetry run pyinstaller -w --name="${EXECUTABLE}" --icon="Houdini_Package_Manager/resources/icons/hpm.ico" main.py
	@python -c "\
	import shutil;\
	shutil.copytree('houdini_package_manager/resources', 'dist/${EXECUTABLE}/resources');\
	"
	@echo "Built: ${EXECUTABLE}"

# create a copy of the dist build in the HouPM website dist_hpm folder
.PHONY: dist-move
dist-move:
	@python -c "\
	import shutil;\
	shutil.rmtree('docs/dist_hpm', ignore_errors=True);\
	shutil.copytree('dist', 'docs/dist_hpm');\
	print('Updated /dist_hpm from /dist');\
	"

# update HPM version html in houpm website
.PHONY: update-houpm
update-houpm:
	@powershell -Command "(Get-Content docs/index.html) \
	-replace 'Houdini_Package_Manager-[0-9]+\.[0-9]+\.[0-9]+', 'Houdini_Package_Manager-$(VERSION)' \
	-replace 'Download HPM [0-9]+\.[0-9]+\.[0-9]+', 'Download HPM $(VERSION)' \
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