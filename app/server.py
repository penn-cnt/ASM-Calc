from flask import Flask, jsonify, request
from datetime import datetime, timedelta, timezone
from services.pharmacokinetics import calculate_drug_levels, DrugModel

app = Flask(__name__)


@app.route("/api/calculate", methods=["POST"])
def calculate_concentrations():
    try:
        data = request.json
        print("Received data:", data)  # Debug print

        if not data or "medicationHistory" not in data:
            return jsonify({"error": "No medication history provided"}), 400

        if "asmParameters" not in data:
            return jsonify({"error": "No ASM parameters provided"}), 400

        # Convert medication history with ASM type
        med_history = []
        for med in data["medicationHistory"]:
            if "asmType" not in med:
                return jsonify({"error": "Missing asmType in medication entry"}), 400

            try:
                event = MedicationEvent(
                    timestamp=med["timestamp"],
                    dosage=med["dosage"],
                    asm_type=med["asmType"],
                )
                med_history.append(event)
            except Exception as e:
                print(f"Error processing medication entry: {e}")
                return jsonify({"error": f"Invalid medication entry: {str(e)}"}), 400

        # Get parameters for each ASM type
        asm_params = {}
        for asm_name, params in data["asmParameters"].items():
            try:
                asm_params[asm_name] = {
                    "half_life": float(params["halfLife"]),
                    "vd": float(params["vd"]),
                    "bioavailability": float(params["bioavailability"]),
                }
            except (KeyError, ValueError) as e:
                return (
                    jsonify({"error": f"Invalid parameters for {asm_name}: {str(e)}"}),
                    400,
                )

        # Calculate concentrations using shared time points
        all_results = []
        time_to_concentrations = {}

        # Create global time points using all medications across all ASMs
        all_med_times = [
            datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00"))
            for m in data["medicationHistory"]
        ]
        if not all_med_times:
            return jsonify([])

        # Set time window to be 1 hour before now to selected range after now
        global_start = datetime.now(timezone.utc) - timedelta(hours=1)
        global_end = global_start + timedelta(
            hours=73
        )  # 1 hour before + maximum 3 days

        # Always generate time points every 10 minutes for smooth curves
        current = global_start.replace(minute=0, second=0, microsecond=0)
        global_time_points = []
        while current <= global_end:
            global_time_points.append(current)
            current += timedelta(minutes=10)

        # Include medication times that are within our window
        relevant_med_times = [
            t for t in all_med_times if global_start <= t <= global_end
        ]
        global_time_points.extend(relevant_med_times)
        global_time_points = sorted(list(set(global_time_points)))

        # Calculate concentrations for each ASM using the same time points
        for asm_name, params in asm_params.items():
            # Filter medications for this ASM type
            asm_meds = [m for m in med_history if m.asm_type == asm_name]
            if not asm_meds:
                continue

            try:
                # Calculate concentrations at global time points
                times, concentrations = calculate_drug_levels(
                    asm_meds,
                    params,
                    global_time_points,  # Pass the precomputed time points
                )

                # Store concentrations for each time point
                for t, c in zip(times, concentrations):
                    time_str = t.isoformat()
                    if time_str not in time_to_concentrations:
                        time_to_concentrations[time_str] = {"Total": 0}
                    time_to_concentrations[time_str][asm_name] = c
                    time_to_concentrations[time_str]["Total"] += c

            except Exception as e:
                print(f"Error calculating concentrations for {asm_name}: {e}")
                return (
                    jsonify({"error": f"Calculation failed for {asm_name}: {str(e)}"}),
                    500,
                )

        # Convert to final results format
        for time_str, concentrations in time_to_concentrations.items():
            entry = {"time": time_str, **concentrations}
            all_results.append(entry)

        # Sort final results by time
        all_results.sort(key=lambda x: x["time"])

        return jsonify(all_results)

    except Exception as e:
        print("Server error:", str(e))
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# Sample drug parameters storage
DRUG_PARAMS = {
    "half_life": 12,  # hours
    "vd": 0.7,  # L/kg
    "bioavailability": 0.8,  # fraction
}


class MedicationEvent:
    def __init__(self, timestamp, dosage, asm_type):
        # Parse timestamp string to datetime object in UTC
        if isinstance(timestamp, str):
            try:
                self.timestamp = datetime.fromisoformat(
                    timestamp.replace("Z", "+00:00")
                ).astimezone(timezone.utc)
            except ValueError:
                try:
                    self.timestamp = datetime.strptime(
                        timestamp, "%Y-%m-%dT%H:%M:%S"
                    ).replace(tzinfo=timezone.utc)
                except ValueError as e:
                    raise ValueError(f"Invalid timestamp format: {e}")
        else:
            self.timestamp = timestamp

        try:
            self.dosage = float(dosage)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Invalid dosage value: {e}")

        if not asm_type:
            raise ValueError("ASM type cannot be empty")
        self.asm_type = asm_type
        self.taken = True


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    # Enable debug mode and specify host
    app.run(debug=True, host="0.0.0.0", port=8000)
