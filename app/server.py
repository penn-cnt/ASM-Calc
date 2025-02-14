from flask import Flask, jsonify, request
from datetime import datetime, timedelta, timezone
from services.pharmacokinetics import calculate_drug_levels

app = Flask(__name__)


@app.route("/api/calculate", methods=["POST"])
def calculate_concentrations():
    try:
        # Log incoming request data
        print("Received request data:", request.get_data())
        print("Parsed JSON:", request.json)

        data = request.json
        print("Received data:", data)  # Debug print
        if not data:
            return jsonify({"error": "No JSON data received"}), 400

        # Add input validation
        if not data.get("medicationHistory"):
            return jsonify({"error": "No medication history provided"}), 400

        print("Medication history:", data["medicationHistory"])

        # Debug each medication entry
        for med in data["medicationHistory"]:
            print(f"Processing medication entry: {med}")
            print(f"Dosage type: {type(med['dosage'])}")
            print(f"Dosage value: {med['dosage']}")

        # Convert medication history to objects with UTC timestamps
        med_history = []
        for med in data["medicationHistory"]:
            event = MedicationEvent(med["timestamp"], med["dosage"])
            med_history.append(event)

        # Get parameters with explicit type conversion
        params = {
            "half_life": float(data.get("halfLife", DRUG_PARAMS["half_life"])),
            "vd": float(data.get("vd", DRUG_PARAMS["vd"])),
            "bioavailability": float(
                data.get("bioavailability", DRUG_PARAMS["bioavailability"])
            ),
        }

        # Calculate concentrations
        times, concentrations = calculate_drug_levels(med_history, params)

        # Format results
        results = [
            {"time": t.isoformat(), "concentration": round(c, 2)}
            for t, c in zip(times, concentrations)
        ]

        return jsonify(results)
    except Exception as e:
        print("Server error:", str(e))  # Log the error
        import traceback

        traceback.print_exc()  # Print full traceback
        return jsonify({"error": str(e)}), 500


# Sample drug parameters storage
DRUG_PARAMS = {
    "half_life": 12,  # hours
    "vd": 0.7,  # L/kg
    "bioavailability": 0.8,  # fraction
}


class MedicationEvent:
    def __init__(self, timestamp, dosage):
        # Parse timestamp string to datetime object in UTC
        if isinstance(timestamp, str):
            try:
                self.timestamp = datetime.fromisoformat(
                    timestamp.replace("Z", "+00:00")
                )
            except ValueError:
                self.timestamp = datetime.strptime(
                    timestamp, "%Y-%m-%dT%H:%M:%S"
                ).replace(tzinfo=timezone.utc)
        else:
            self.timestamp = timestamp

        self.dosage = float(dosage)
        self.taken = True


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    # Enable debug mode and specify host
    app.run(debug=True, host="0.0.0.0", port=8000)
