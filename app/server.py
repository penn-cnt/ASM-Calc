from flask import Flask, jsonify, request
from datetime import datetime, timedelta, timezone
from services.pharmacokinetics import calculate_drug_levels

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

        # Calculate concentrations for each ASM type
        all_results = []
        for asm_name, params in asm_params.items():
            # Filter medications for this ASM type
            asm_meds = [m for m in med_history if m.asm_type == asm_name]
            if not asm_meds:
                continue

            try:
                times, concentrations = calculate_drug_levels(asm_meds, params)
                all_results.extend(
                    [
                        {
                            "time": t.isoformat(),
                            "concentration": round(c, 2),
                            "asmType": asm_name,
                        }
                        for t, c in zip(times, concentrations)
                    ]
                )
            except Exception as e:
                print(f"Error calculating concentrations for {asm_name}: {e}")
                return (
                    jsonify({"error": f"Calculation failed for {asm_name}: {str(e)}"}),
                    500,
                )

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
                )
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
