const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

class SheetService {
    constructor(sheetId) {
        this.sheetId = sheetId;
        this.jwt = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
            scopes: SCOPES,
        });
        this.doc = new GoogleSpreadsheet(this.sheetId, this.jwt);
    }

    async initialize() {
        await this.doc.loadInfo();
        this.sheet = this.doc.sheetsByTitle['PROMPTS'];
        await this.sheet.loadCells('A2:B20');
    }

    async getPrompt(command) {
        await this.sheet.loadCells('A2:B20');
        for(let i = 1; i <= 19; i++) { // Iniciamos en 1 (fila 2) hasta 19 (fila 20)
            let commandCell = this.sheet.getCell(i, 1); // Columna B
            if(commandCell.value === command) {
                return this.sheet.getCell(i, 0).value; // Columna A
            }
        }
        return null;  // Si no encuentra el comando, devuelve null.
    }
}
const initialized = new SheetService('1xOknNihH1GHE32mHRduVBFoafjhWldAoy9G23ns31W8');
initialized.initialize().then(res => {
    console.log("GoogleSheet initialized");
});
module.exports = initialized;
