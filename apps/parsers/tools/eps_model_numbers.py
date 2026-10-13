"""Print native EPS numbers using its own public vehicle tree and metadata."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.adapters.eps import EpsAdapter
from tools.facet_model_numbers import main


if __name__ == "__main__":
    main(EpsAdapter)
