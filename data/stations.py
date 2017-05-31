"""
Preprocessing for stations data.
"""

from os import path
import pandas as pd

raw_folder = "raw_data"
clean_folder = "clean_data"

stops = pd.read_csv(path.join(raw_folder, "stops.txt"))
stops.loc[:, "UIC7"] = stops.stop_id.apply(lambda x: x[-7:])
stops = stops.loc[stops.stop_id.str.startswith("StopPoint"), :]
stops.set_index("UIC7", inplace=True)

stations = pd.read_csv(
    path.join(raw_folder, "sncf-lignes-par-gares-idf.csv"),
    sep=";"
)
stations.loc[:, "UIC7"] = stations.Code_UIC.apply(lambda x: str(x)[:-1])

ms = stations.join(stops, on="UIC7", how="left", rsuffix="_")

# LINE SELECTION
# ms.loc[ms.H.notnull(), :]

# EXPORT
# ms.to_json(path.join(clean_folder, "stations.json"), orient="records")
