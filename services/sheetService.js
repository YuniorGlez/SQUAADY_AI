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
        await this.sheet.loadCells('A1:J30');
    }

    async getReportPrompt() {
        await this.sheet.loadCells('A1:J30');
        return this.sheet.getCellByA1('A6').value;
    }
}
const initialized = new SheetService('1xOknNihH1GHE32mHRduVBFoafjhWldAoy9G23ns31W8');
initialized.initialize().then(res => {
    console.log("GoogleSheet initialized");
});
module.exports = initialized;