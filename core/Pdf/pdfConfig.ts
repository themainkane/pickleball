export interface PdfConfig {
     courtWidth: number;
     courtHeight: number;
     courtSpacing: number;
     /** Vertical gap between wrapped rows of courts, leaving room for the court labels. */
     courtRowSpacing: number;
     restPileSpacing: number;
}
export const defaultPdfConfig: PdfConfig = {
    courtWidth: 115,
    courtHeight: 140,
    courtSpacing: 15,
    courtRowSpacing: 30,
    restPileSpacing: 5,
};
