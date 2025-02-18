from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from .services.pharmacokinetics import (
    DrugModel,
    generate_time_series,
    calculate_total_concentration,
)

app = Flask(__name__)
CORS(app)


@app.route("/api")
def api_home():
    return jsonify({"status": "ok", "message": "API is running"})


@app.route("/api/calculate", methods=["POST", "OPTIONS"])
def calculate_concentrations():
    if request.method == "OPTIONS":
        return "", 204
    try:
        data = request.get_json()
        if not all(
            k in data for k in ["patient_weight", "medications", "asm_parameters"]
        ):
            return jsonify({"error": "Missing required fields"}), 400

        dose_events = {}
        for med in data["medications"]:
            try:
                timestamp = datetime.fromisoformat(
                    med["timestamp"].replace("Z", "+00:00")
                ).replace(second=0, microsecond=0)
                dose_mg = convert_to_mg(float(med["dosage"]), med["unit"])
                key = (timestamp, med["asmType"])
                dose_events[key] = dose_events.get(key, 0) + dose_mg
            except (KeyError, ValueError) as e:
                return jsonify({"error": f"Invalid medication data: {str(e)}"}), 400

        latest_dose = (
            max(
                datetime.fromisoformat(med["timestamp"].replace("Z", "+00:00"))
                for med in data["medications"]
            )
            if data["medications"]
            else datetime.now(timezone.utc)
        )

        display_start = datetime.now(timezone.utc) - timedelta(
            hours=data.get("time_offset", 0)
        )
        display_end = display_start + timedelta(hours=data.get("time_range", 24))

        earliest_dose = (
            min(
                datetime.fromisoformat(med["timestamp"].replace("Z", "+00:00"))
                for med in data["medications"]
            )
            if data["medications"]
            else display_start
        )

        calculation_end = max(latest_dose + timedelta(days=7), display_end)
        time_points = generate_time_series(
            start_time=earliest_dose, end_time=calculation_end, resolution=10
        )

        dose_times = {
            datetime.fromisoformat(med["timestamp"].replace("Z", "+00:00")).replace(
                second=0, microsecond=0
            )
            for med in data["medications"]
        }
        all_time_points = sorted(set(time_points) | dose_times)

        results = []
        individual_concentrations = {}

        for asm_name, params in data["asm_parameters"].items():
            asm_doses = {
                ts: dose for (ts, name), dose in dose_events.items() if name == asm_name
            }
            if not asm_doses:
                continue
            try:
                model = DrugModel(
                    half_life_hours=float(params["halfLife"]),
                    volume_distribution=float(params["vd"]),
                    bioavailability=float(params["bioavailability"]),
                )
            except (KeyError, ValueError) as e:
                return (
                    jsonify({"error": f"Invalid parameters for {asm_name}: {str(e)}"}),
                    400,
                )

            concentrations = [
                model.calculate_concentration(asm_doses, t) for t in all_time_points
            ]
            individual_concentrations[asm_name] = concentrations
            results.append(
                {
                    "asm": asm_name,
                    "times": [t.isoformat() for t in all_time_points],
                    "concentrations": concentrations,
                }
            )

        if len(individual_concentrations) >= 2:
            total_concentrations = calculate_total_concentration(
                individual_concentrations
            )
            results.append(
                {
                    "asm": "Total",
                    "times": [t.isoformat() for t in all_time_points],
                    "concentrations": total_concentrations,
                }
            )
        return jsonify(
            {
                "start_time": display_start.isoformat(),
                "results": results,
                "weight": data["patient_weight"],
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def convert_to_mg(value, unit):
    unit = unit.lower()
    if unit == "ug":
        return value / 1000
    elif unit == "g":
        return value * 1000
    elif unit == "mg":
        return value
    else:
        raise ValueError(f"Invalid unit: {unit}")


# Add this for local development
if __name__ == "__main__":
    app.run(port=3000)
