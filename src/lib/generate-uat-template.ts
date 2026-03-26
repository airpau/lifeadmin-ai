import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType } from 'docx';

export interface UATTemplate {
  projectName: string;
  version: string;
  testDate: string;
  testerName?: string;
}

export function generateUATDocument(params: UATTemplate): Document {
  return new Document({
    sections: [
      {
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: `${params.projectName} - User Acceptance Testing Plan`,
                bold: true,
                size: 32,
              }),
            ],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Version: ${params.version} | Test Date: ${params.testDate}`,
                italics: true,
                size: 24,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Tester Information
          new Paragraph({
            children: [
              new TextRun({
                text: "Tester Information",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          createInfoTable(),

          // Test Overview
          new Paragraph({
            children: [
              new TextRun({
                text: "Test Overview",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: "Welcome to the Paybacker beta testing program! This document will guide you through comprehensive testing of our platform. Please complete all sections and provide detailed feedback to help us improve the user experience.",
                size: 24,
              }),
            ],
            spacing: { after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: "Testing Instructions:",
                bold: true,
                size: 24,
              }),
            ],
            spacing: { after: 100 },
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: "• Test on your preferred device (desktop, tablet, mobile)\n• Use real data where possible\n• Rate each section from 1-5 (1=Poor, 5=Excellent)\n• Provide detailed comments for any issues\n• Note any confusing or unclear elements",
                size: 22,
              }),
            ],
            spacing: { after: 400 },
          }),

          // Core Feature Tests
          new Paragraph({
            children: [
              new TextRun({
                text: "1. Core Feature Testing",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          createFeatureTestTable(),

          // User Journey Tests
          new Paragraph({
            children: [
              new TextRun({
                text: "2. User Journey Testing",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          createUserJourneyTable(),

          // Usability Assessment
          new Paragraph({
            children: [
              new TextRun({
                text: "3. Usability Assessment",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          createUsabilityTable(),

          // Bug Reports
          new Paragraph({
            children: [
              new TextRun({
                text: "4. Bug Reports",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          createBugReportTable(),

          // Feature Requests
          new Paragraph({
            children: [
              new TextRun({
                text: "5. Feature Requests & Suggestions",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          createFeatureRequestTable(),

          // Overall Experience
          new Paragraph({
            children: [
              new TextRun({
                text: "6. Overall Experience Rating",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          createOverallRatingTable(),

          // Final Comments
          new Paragraph({
            children: [
              new TextRun({
                text: "7. Additional Comments",
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: "Thank you for your valuable feedback! Please save this document and email it to beta@paybacker.co.uk when complete.",
                italics: true,
                size: 24,
              }),
            ],
            spacing: { before: 400 },
          }),
        ],
      },
    ],
  });
}

function createInfoTable(): Table {
  return new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tester Name:", bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "_________________________" })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Email:", bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "_________________________" })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Device Used:", bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "_________________________" })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Browser:", bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "_________________________" })] })] }),
        ],
      }),
    ],
  });
}

function createFeatureTestTable(): Table {
  const features = [
    "Sign up process",
    "Dashboard overview",
    "Bank account connection",
    "Subscription detection",
    "Complaint letter generation",
    "Deal recommendations",
    "Money Hub analytics",
    "Profile settings",
  ];

  const headerRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Feature", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Rating (1-5)", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Comments", bold: true })] })] }),
    ],
  });

  const featureRows = features.map(feature => 
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: feature })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "___" })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "" })] })] }),
      ],
    })
  );

  return new Table({
    rows: [headerRow, ...featureRows],
  });
}

function createUserJourneyTable(): Table {
  const journeys = [
    "First-time user onboarding",
    "Connecting a bank account",
    "Generating first complaint letter",
    "Finding and clicking on deals",
    "Viewing spending analytics",
    "Managing subscriptions",
  ];

  const headerRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "User Journey", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Completed?", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Difficulty (1-5)", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Notes", bold: true })] })] }),
    ],
  });

  const journeyRows = journeys.map(journey => 
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: journey })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Y / N" })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "___" })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "" })] })] }),
      ],
    })
  );

  return new Table({
    rows: [headerRow, ...journeyRows],
  });
}

function createUsabilityTable(): Table {
  const aspects = [
    "Overall design and layout",
    "Navigation clarity",
    "Page loading speed",
    "Mobile responsiveness",
    "Text readability",
    "Button and link visibility",
    "Error messages helpfulness",
  ];

  const headerRow = new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Usability Aspect", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Rating (1-5)", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Feedback", bold: true })] })] }),
    ],
  });

  const aspectRows = aspects.map(aspect => 
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: aspect })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "___" })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "" })] })] }),
      ],
    })
  );

  return new Table({
    rows: [headerRow, ...aspectRows],
  });
}