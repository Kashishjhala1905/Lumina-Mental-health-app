// Official support services used for referrals and urgent-help listings.
// Each entry records where its contact details were verified. Lumina has NO technical integration with
// any of these services: referrals are made manually by counselors (see services/integrations).
//
// Verification (2026-10-31): numbers were checked against the official websites listed in `sourceUrl`.
// 112.gov.in could not be reached from the verification environment, so that entry is marked unverified.
// Keep client/src/components/victim-support/vsConstants.js (HELPLINES) in sync with this file.
const VERIFIED_ON = '2026-10-31';

const SUPPORT_DIRECTORY = [
    {
        id: 'erss-112',
        name: 'Emergency Response Support System (Police / Ambulance / Fire)',
        phone: '112',
        website: 'https://112.gov.in',
        sourceUrl: 'https://112.gov.in',
        categories: ['Safety and protection resources'],
        verification: { status: 'unverified', checkedOn: VERIFIED_ON, note: 'Official site unreachable during verification; 112 is the national emergency number.' },
    },
    {
        id: 'nhaa-14566',
        name: 'National Helpline Against Atrocities (SCs and STs)',
        phone: '14566',
        website: 'https://socialjustice.gov.in',
        sourceUrl: 'https://socialjustice.gov.in',
        categories: ['Legal aid information', 'Safety and protection resources'],
        verification: { status: 'verified', checkedOn: VERIFIED_ON, note: 'Listed on the Ministry of Social Justice & Empowerment homepage.' },
    },
    {
        id: 'telemanas',
        name: 'Tele-MANAS – National Tele Mental Health Programme',
        phone: '14416 / 1-800-891-4416',
        website: 'https://telemanas.mohfw.gov.in',
        sourceUrl: 'https://telemanas.mohfw.gov.in',
        categories: ['Mental health counseling', 'Medical/professional assistance'],
        verification: { status: 'verified', checkedOn: VERIFIED_ON, note: 'Numbers published on the official Tele-MANAS website.' },
    },
    {
        id: 'women-181',
        name: 'Women Helpline',
        phone: '181',
        website: 'https://wcd.gov.in',
        sourceUrl: 'https://wcd.gov.in',
        categories: ['Safety and protection resources', 'Social and community support'],
        verification: { status: 'verified', checkedOn: VERIFIED_ON, note: 'Listed on the Ministry of Women and Child Development homepage.' },
    },
    {
        id: 'childline-1098',
        name: 'Childline (children in distress)',
        phone: '1098',
        website: 'https://wcd.gov.in',
        sourceUrl: 'https://wcd.gov.in',
        categories: ['Safety and protection resources'],
        verification: { status: 'verified', checkedOn: VERIFIED_ON, note: 'Listed on the Ministry of Women and Child Development homepage.' },
    },
    {
        id: 'nalsa-15100',
        name: 'NALSA – Free Legal Aid Helpline',
        phone: '15100',
        website: 'https://nalsa.gov.in',
        sourceUrl: 'https://nalsa.gov.in',
        categories: ['Legal aid information'],
        verification: { status: 'verified', checkedOn: VERIFIED_ON, note: 'Shown as "NALSA Helpline Toll-Free Number" on nalsa.gov.in.' },
    },
    {
        id: 'cybercrime-1930',
        name: 'National Cyber Crime Helpline (financial cyber fraud)',
        phone: '1930',
        website: 'https://cybercrime.gov.in',
        sourceUrl: 'https://cybercrime.gov.in',
        categories: ['Safety and protection resources', 'Financial assistance information'],
        verification: { status: 'verified', checkedOn: VERIFIED_ON, note: 'Published on the National Cyber Crime Reporting Portal.' },
    },
];

const findDirectoryEntry = (id) => SUPPORT_DIRECTORY.find((e) => e.id === id) || null;

module.exports = { SUPPORT_DIRECTORY, findDirectoryEntry, VERIFIED_ON };
