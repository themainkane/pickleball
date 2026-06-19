export interface PdfConfig {
     courtWidth: number;
     courtHeight: number;
     courtSpacing: number;
     restPileSpacing: number;
}
export const defaultPdfConfig: PdfConfig = {
    courtWidth: 115,
    courtHeight: 140,
    courtSpacing: 15,
    restPileSpacing: 5,
};
