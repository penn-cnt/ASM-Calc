from flask import Flask, jsonify, request
from datetime import datetime, timedelta
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

        # Convert medication history to objects
        try:
            med_history = []
            for med in data["medicationHistory"]:
                print(f"Processing medication entry: {med}")  # Debug print
                event = MedicationEvent(med["timestamp"], med["dosage"])
                print(
                    f"Created MedicationEvent: timestamp={event.timestamp}, dosage={event.dosage}"
                )
                med_history.append(event)
        except Exception as e:
            print(f"Error processing medication: {str(e)}")  # Debug print
            return jsonify({"error": str(e)}), 400

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
    def __init__(self, timestamp, dosage, taken=True):
        try:
            self.timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

            # Print debug info
            print(f"Processing dosage: {dosage} (type: {type(dosage)})")

            # More robust dosage handling
            if isinstance(dosage, (int, float)):
                self.dosage = float(dosage)
            elif isinstance(dosage, str):
                # Extract numeric value from string like "500 mg"
                import re

                match = re.search(r"(\d+(?:\.\d+)?)", dosage)
                if not match:
                    raise ValueError(f"No numeric value found in dosage: {dosage}")
                self.dosage = float(match.group(1))
            else:
                raise ValueError(f"Unsupported dosage type: {type(dosage)}")

            self.taken = taken

            # Print successful creation
            print(f"Successfully created MedicationEvent with dosage: {self.dosage}")

        except Exception as e:
            print(f"Error in MedicationEvent: {str(e)}")
            print(f"Timestamp: {timestamp}")
            print(f"Dosage: {dosage}")
            raise ValueError(f"Invalid medication data: {str(e)}")


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    # Enable debug mode and specify host
    app.run(debug=True, host="0.0.0.0", port=8000)
