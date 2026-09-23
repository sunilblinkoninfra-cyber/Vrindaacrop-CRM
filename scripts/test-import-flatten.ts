import { parseFile } from "../lib/import/parse";
import { maybeFlatten, hasContactBlocks } from "../lib/import/flatten";

function testFlattening() {
  console.log("=== Testing Sheet Flattening Logic ===");

  // Mock an account-centric sheet similar to NCR Smartsheet
  const mockColumns = [
    "Account Name",
    "Industry Category",
    "City",
    "Contact Name",
    "Designation",
    "Mobile",
    "Email id",
    "Contact Name (1)",
    "Designation (1)",
    "Mobile (1)",
    "Email id (1)",
  ];

  const mockRows = [
    {
      "Account Name": "Fortis Healthcare",
      "Industry Category": "Healthcare",
      "City": "Gurgaon",
      "Contact Name": "Dr. Ramesh Verma",
      "Designation": "Medical Director",
      "Mobile": "9811122233",
      "Email id": "ramesh.verma@fortishealthcare.com",
      "Contact Name (1)": "Anita Sharma",
      "Designation (1)": "Head of Procurement",
      "Mobile (1)": "9811144455",
      "Email id (1)": "anita.sharma@fortishealthcare.com",
    },
    {
      "Account Name": "DLF Cybercity Facilities",
      "Industry Category": "Real Estate",
      "City": "Gurgaon",
      "Contact Name": "Vikram Seth",
      "Designation": "VP Facilities",
      "Mobile": "9999988888",
      "Email id": "vikram.seth@dlf.in",
      "Contact Name (1)": "",
      "Designation (1)": "",
      "Mobile (1)": "",
      "Email id (1)": "",
    },
  ];

  const parsed = {
    columns: mockColumns,
    rows: mockRows,
  };

  const detected = hasContactBlocks(parsed.columns);
  console.log("Has contact blocks detected:", detected);
  if (!detected) throw new Error("Failed to detect contact blocks!");

  const flattened = maybeFlatten(parsed);
  console.log("Flattened columns:", flattened.columns);
  console.log("Flattened row count (expected 3):", flattened.rows.length);
  console.log("Sample flattened rows:", JSON.stringify(flattened.rows, null, 2));

  if (flattened.rows.length !== 3) {
    throw new Error(`Expected 3 flattened contacts, got ${flattened.rows.length}`);
  }

  // Verify contact 1
  if (flattened.rows[0].Email !== "ramesh.verma@fortishealthcare.com" || flattened.rows[0].Company !== "Fortis Healthcare") {
    throw new Error("Contact 1 mapping mismatch!");
  }
  // Verify contact 2
  if (flattened.rows[1].Email !== "anita.sharma@fortishealthcare.com" || flattened.rows[1].Company !== "Fortis Healthcare") {
    throw new Error("Contact 2 mapping mismatch!");
  }
  // Verify contact 3
  if (flattened.rows[2].Email !== "vikram.seth@dlf.in" || flattened.rows[2].Company !== "DLF Cybercity Facilities") {
    throw new Error("Contact 3 mapping mismatch!");
  }

  console.log("✅ All flattening tests passed!");
}

testFlattening();
