# ASM-Calc

A web application for calculating and visualizing anti-seizure medication (ASM) concentrations over time. This tool helps healthcare providers track multiple ASM levels using pharmacokinetic modeling.

You can check out the live demo [here](https://www.asmcalc.com) or follow the steps below to run it locally.

## Features

- Real-time concentration calculations for multiple ASMs
- Interactive visualization of drug levels over time
- Customizable pharmacokinetic parameters
- Support for multiple dosing regimens

![ASM-Calc Screenshot](https://github.com/user-attachments/assets/e6171002-2a9b-4acc-83fa-79abb6cc4ec5)

## Prerequisites

- Python 3.12 or higher
- Node.js 23.7 or higher
- npm 10.9 or higher
- Vercel CLI 41.1 or higher 
  - `npm i -g vercel`

## Local Development Setup

1. Clone the repository:
```bash
git clone https://github.com/penn-cnt/ASM-Calc.git
```

2. Install Python dependencies:
```bash
cd api && python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt && cd ..
```

3. Start the development server:
```bash
# You may need to run `vercel login` first
vercel dev
```

## Acknowledgments

- Based on pharmacokinetic models by Nina Ghosn: [ASM-project](https://github.com/nghosn3/ASM-project)
- Please cite: https://doi.org/10.1111/epi.17558
