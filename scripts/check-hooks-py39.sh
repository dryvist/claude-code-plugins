#!/usr/bin/env bash
# Import every hook script under the active Python to catch runtime breakage that
# `py_compile` (syntax-only) misses — notably PEP 604 unions (`X | None`), which
# are valid syntax but raise TypeError at runtime on Python < 3.10. Hooks run on
# user machines via `#!/usr/bin/env python3`; on macOS that is the system Python
# 3.9, so this check is meant to run under 3.9 in CI. Importing (not executing)
# each module evaluates its annotations and top-level code; main() is
# __name__-guarded, so nothing runs.
set -euo pipefail

echo "Importing hook scripts under $(python3 --version)..."
rc=0
while IFS= read -r script; do
  [ -f "$script" ] || continue
  echo "Importing: $script"
  if ! python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('hook', sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
" "$script"; then
    echo "ERROR: $script fails to import under $(python3 --version)"
    rc=1
  fi
done < <(find . -name "*.py" -path "*/scripts/*" ! -name "test_*")
exit "$rc"
