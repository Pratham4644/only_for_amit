const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

/**
 * Generate QR code for a student
 * @param {string} studentId - Student ID to encode
 * @param {string} outputPath - Path to save QR code image (optional)
 * @returns {Promise<string>} - Data URL or file path of generated QR code
 */
async function generateQRCode(studentId, outputPath = null) {
    try {
        // Create QR code data - just the student ID
        const qrData = studentId;

        const options = {
            errorCorrectionLevel: 'H',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            width: 300,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        };

        if (outputPath) {
            // Save to file
            await QRCode.toFile(outputPath, qrData, options);
            return outputPath;
        } else {
            // Return as data URL
            const dataUrl = await QRCode.toDataURL(qrData, options);
            return dataUrl;
        }
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
}

/**
 * Generate QR codes for multiple students
 * @param {Array} students - Array of student objects with student_id
 * @param {string} outputDir - Directory to save QR codes
 * @returns {Promise<Array>} - Array of generated file paths
 */
async function generateBulkQRCodes(students, outputDir) {
    try {
        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const results = [];

        for (const student of students) {
            const filename = `qr_${student.student_id}.png`;
            const filepath = path.join(outputDir, filename);
            await generateQRCode(student.student_id, filepath);
            results.push({
                student_id: student.student_id,
                qr_path: filepath
            });
        }

        return results;
    } catch (error) {
        console.error('Error generating bulk QR codes:', error);
        throw error;
    }
}

module.exports = {
    generateQRCode,
    generateBulkQRCodes
};
