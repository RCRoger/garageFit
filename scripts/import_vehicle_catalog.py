import csv
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "src" / "infrastructure" / "vehicle-database" / "vehicles.json"
SOURCE_REVISION = "ee99776470a45214bf524cdfe22e5dbf4bd67f93"
MODEL_SOURCE = f"https://github.com/gor3a/vehicle-makes-models/blob/{SOURCE_REVISION}/data/csv/makes-models.csv"
ENGINE_SOURCE = f"https://github.com/gor3a/vehicle-makes-models/blob/{SOURCE_REVISION}/data/csv/engines.csv"
SOURCE_SHA256 = {
    "makes-models.csv": "7db36a8d9fe96d70f7f3aca8ef422a23f20be62ad3c0ff0344ca32e4d4fb54cd",
    "engines.csv": "6a2283e932beb936f7c1128356584a6ba9401b9144de3b8a126bf5bf10127343",
}
DIMENSION_COLUMNS = {
    "length": ("length_mm", 1000, 8000),
    "bodyWidth": ("width_mm", 1000, 3000),
    "height": ("height_mm", 800, 4000),
    "wheelbase": ("wheelbase_mm", 1000, 5000),
}


def year(value):
    return int(value) if value else None


def dimension(value, minimum, maximum):
    if not value:
        return None
    millimeters = float(value)
    if not minimum <= millimeters <= maximum:
        return None
    return round(millimeters / 10, 1)


def make_id(parts):
    identity = "\0".join(str(part or "") for part in parts)
    return f"catalog-{hashlib.sha1(identity.encode('utf-8')).hexdigest()[:16]}"


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python scripts/import_vehicle_catalog.py makes-models.csv engines.csv")

    models_path, engines_path = map(Path, sys.argv[1:])
    for path in (models_path, engines_path):
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_hash != SOURCE_SHA256[path.name]:
            raise SystemExit(f"Unexpected source file hash for {path.name}; expected the pinned upstream snapshot.")
    models = read_csv(models_path)
    engines = read_csv(engines_path)
    records = []
    model_keys = set()

    generations = {}
    for engine in engines:
        key = (
            engine["make"],
            engine["model"],
            engine["generation"],
            engine["gen_year_start"],
            engine["gen_year_end"],
        )
        model_keys.add((engine["make"], engine["model"]))
        dimensions = tuple(engine[column] for column, _, _ in DIMENSION_COLUMNS.values())
        generations.setdefault(key, {}).setdefault(dimensions, engine["engine_label"])

    for make, model, generation, start, end in sorted(generations, key=lambda item: tuple(value.casefold() for value in item[:3])):
        variants = generations[(make, model, generation, start, end)]
        for dimension_values, label in sorted(variants.items(), key=lambda item: tuple(value or "" for value in item[0])):
            spec = {
                name: dimension(dimension_values[index], minimum, maximum)
                for index, (name, (_, minimum, maximum)) in enumerate(DIMENSION_COLUMNS.items())
            }
            if spec["length"] is not None and spec["wheelbase"] is not None and spec["wheelbase"] >= spec["length"]:
                spec["wheelbase"] = None
            records.append({
                "id": make_id((make, model, generation, start, end, *dimension_values)),
                "manufacturer": make,
                "model": model,
                "generation": generation,
                "trim": f"Dimensiones de {label}" if len(variants) > 1 and label else "",
                "yearStart": year(start),
                "yearEnd": year(end),
                "dimensions": spec,
                "sourceUrl": ENGINE_SOURCE,
            })

    for model_row in models:
        make = model_row["make"]
        model = model_row["model"]
        if (make, model) in model_keys:
            continue
        start = model_row["year_start"]
        end = model_row["year_end"]
        records.append({
            "id": make_id((make, model, start, end)),
            "manufacturer": make,
            "model": model,
            "generation": "",
            "trim": "",
            "yearStart": year(start),
            "yearEnd": year(end),
            "dimensions": {name: None for name in DIMENSION_COLUMNS},
            "sourceUrl": MODEL_SOURCE,
        })

    records.sort(key=lambda item: (
        item["manufacturer"].casefold(),
        item["model"].casefold(),
        item["yearStart"] or 0,
        item["generation"].casefold(),
        item["trim"].casefold(),
    ))
    CATALOG_PATH.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} models/generations to {CATALOG_PATH}")


if __name__ == "__main__":
    main()
