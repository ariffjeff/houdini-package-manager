# Package Parsing for HPM

##  Behaviors that HPM uses to parse Houdini JSON packages.

- JSON packages are flattened so that every value at the end of every chain gets separated into its own list with a path leading up to it. This is to simplify the package for further parsing.
	- e.g. flattened result: `["env", 0, "HOUDINI_PATH", "some/path/to/plugin/dir"]`

- Variable values will always be the last list item.
- Variable keys will always be the second to last list item.

- When a variable call `$SOME_VAR` is found, the program walks backwards up the list from the call to find the most recent initialization of the variable (variable names will always be the second last element).

- Variable keys are case sensitive.

- `path` and `hpath` are aliases of `HOUDINI_PATH`.
- `path` has been deprecated in favor of `hpath`.

- To be recognized by Houdini:
  - `HOUDINI_PATH` must be within the `env` list.
  - `path` must NOT be within the `env` list. `path` should probably be a top-level variable.
