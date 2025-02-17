# ASM-Calc

A web application for calculating and visualizing anti-seizure medication (ASM) concentrations over time. This tool helps healthcare providers track multiple ASM levels using pharmacokinetic modeling.

## Features

- Real-time concentration calculations for multiple ASMs
- Interactive visualization of drug levels over time
- Customizable pharmacokinetic parameters
- Support for multiple dosing regimens

![ASM-Calc Screenshot](https://github.com/user-attachments/assets/ee05cabb-1948-4cd4-98f7-9282789539f6)

## Prerequisites

- Python 3.12 or higher
- Node.js 23.7 or higher
- npm 10.9 or higher

## Local Development Setup

1. Clone the repository:

```bash
git clone https://github.com/penn-cnt/ASM-Calc.git
```

2. Install Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Start the backend server:

```bash
python3 -m app/server.py
```

4. Install Node.js dependencies:
```bash
cd app && npm install
```

5. Start the development server:
```bash
# In another terminal (in the app directory)
npm run dev
```

6. Open your browser and navigate to `http://localhost:5173`

## Acknowledgments

- Based on pharmacokinetic models by Nina Ghosn: [ASM-project](https://github.com/nghosn3/ASM-project)
- Please cite: https://doi.org/10.1111/epi.17558
