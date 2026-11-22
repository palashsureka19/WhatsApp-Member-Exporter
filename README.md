# WhatsApp Member Exporter

A lightweight utility to export members of a WhatsApp group to a CSV file.

## Features
- Export group members (name, phone number, admin status) to CSV.
- Simple CLI interface.
- Works with the official WhatsApp Web API (via reverse‑engineered endpoints).

## Prerequisites
- Node.js (v18 or newer) installed on your machine.
- A valid WhatsApp Web session (QR code login).

## Installation
```bash
# Clone the repository (if you haven't already)
git clone https://github.com/palashsureka19-cpu/WhatsApp-Member-Exporter.git
cd WhatsApp-Member-Exporter

# Install dependencies
npm install
```

## Usage
```bash
node export.js <group-id> > members.csv
```
- Replace `<group-id>` with the ID of the WhatsApp group you want to export.
- The command writes a CSV list of members to `members.csv` (or stdout if you redirect).

## Example
```bash
node export.js 1234567890abcdef > members.csv
```
The resulting `members.csv` will look like:
```
Name,Phone,IsAdmin
John Doe,+1234567890,false
Jane Smith,+1987654321,true
```

## Contributing
Contributions are welcome! Feel free to open issues or submit pull requests.

## License
This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

---
*This repository is public. Private handoff notes and other sensitive information have been removed from the history.*