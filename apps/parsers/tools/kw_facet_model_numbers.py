"""Print native KW electrical part numbers from its own public vehicle tree."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.adapters.kw_facet import KwFacetAdapter
from tools.facet_model_numbers import main


if __name__ == "__main__":
    main(KwFacetAdapter)
