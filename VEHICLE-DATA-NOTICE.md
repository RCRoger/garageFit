# Vehicle database attribution

The vehicle names, model years, generations, and engine-derived dimension data in
`src/infrastructure/vehicle-database/vehicles.json` are adapted from
[vehicle-makes-models](https://github.com/gor3a/vehicle-makes-models), which
attributes its underlying data to [autoevolution.com](https://www.autoevolution.com/).
The imported snapshot is commit
[`ee99776470a45214bf524cdfe22e5dbf4bd67f93`](https://github.com/gor3a/vehicle-makes-models/commit/ee99776470a45214bf524cdfe22e5dbf4bd67f93).
The upstream data is published under the
[Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/1-0/)
and requires attribution and share-alike for adapted databases.

This catalog is a filtered and transformed derivative of the upstream CSVs:
engine variants are grouped by model generation and dimensions are converted
from millimeters to centimeters. Implausible values outside the simulator's
supported ranges are omitted. Mirror widths and turning diameter are not
provided by this source and remain unknown; missing dimensions are not inferred.
Models without engine data are retained without dimensions. To regenerate the
catalog, obtain both CSVs from the pinned commit above and run
`python scripts/import_vehicle_catalog.py makes-models.csv engines.csv`; the
script verifies the source file checksums before writing the catalog.
