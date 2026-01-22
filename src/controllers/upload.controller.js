const { s3 } = require('../config/aws');
const fs = require('fs');
const path = require('path');

/**
 * Image Upload Pipeline Controller
 *
 * Pipeline Flow:
 * Step 1: Admin uploads image via POST /admin/upload
 * Step 2: Multer saves file to local server disk (/uploads/temp)
 * Step 3: Server initiates upload to AWS S3 bucket
 * Step 4: On S3 Success - Delete local file from /uploads/temp
 * Step 5: On S3 Failure - Return 500 and keep local file for retry/debugging
 * Step 6: Return S3 public URL to client
 *
 * Sample Request:
 * POST /api/admin/upload
 * Content-Type: multipart/form-data
 * Authorization: Bearer <token> OR Cookie: token=<token>
 * Body: { image: <file> }
 *
 * Sample Response (Success):
 * {
 *   "success": true,
 *   "message": "Image uploaded successfully",
 *   "imageUrl": "https://bucket-name.s3.region.amazonaws.com/products/filename.jpg"
 * }
 *
 * Sample Response (Failure):
 * {
 *   "success": false,
 *   "message": "Failed to upload to S3",
 *   "error": "Error details",
 *   "localPath": "/uploads/temp/image-123456.jpg"
 * }
 */
const uploadImageToS3 = async (req, res) => {
  try {
    // Step 2: File already saved locally by Multer middleware
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const localFilePath = req.file.path;
    const fileName = `products/${Date.now()}-${req.file.originalname}`;

    // Step 3: Upload to S3
    try {
      const fileContent = fs.readFileSync(localFilePath);

      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        Body: fileContent,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
      };

      const s3Response = await s3.upload(params).promise();

      // Step 4: S3 Upload Success - Delete local file
      fs.unlinkSync(localFilePath);

      // Step 6: Return S3 public URL
      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        imageUrl: s3Response.Location
      });

    } catch (s3Error) {
      // Step 5: S3 Upload Failed - Keep local file for debugging
      console.error('S3 Upload Error:', s3Error);

      return res.status(500).json({
        success: false,
        message: 'Failed to upload to S3',
        error: s3Error.message,
        localPath: localFilePath // Keep for retry/debugging
      });
    }

  } catch (error) {
    console.error('Upload Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Image upload failed',
      error: error.message
    });
  }
};

/**
 * Upload Multiple Images
 *
 * Sample Request:
 * POST /api/admin/upload/multiple
 * Content-Type: multipart/form-data
 * Authorization: Bearer <token>
 * Body: { images: [<file1>, <file2>, ...] }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "3 images uploaded successfully",
 *   "imageUrls": [
 *     "https://bucket.s3.region.amazonaws.com/products/img1.jpg",
 *     "https://bucket.s3.region.amazonaws.com/products/img2.jpg",
 *     "https://bucket.s3.region.amazonaws.com/products/img3.jpg"
 *   ]
 * }
 */
const uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided'
      });
    }

    const uploadPromises = req.files.map(async (file) => {
      const fileName = `products/${Date.now()}-${file.originalname}`;
      const fileContent = fs.readFileSync(file.path);

      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        Body: fileContent,
        ContentType: file.mimetype,
        ACL: 'public-read'
      };

      try {
        const s3Response = await s3.upload(params).promise();
        fs.unlinkSync(file.path); // Delete local file on success
        return s3Response.Location;
      } catch (error) {
        console.error(`Failed to upload ${file.originalname}:`, error);
        return null;
      }
    });

    const imageUrls = await Promise.all(uploadPromises);
    const successfulUploads = imageUrls.filter(url => url !== null);

    if (successfulUploads.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'All uploads failed'
      });
    }

    return res.status(200).json({
      success: true,
      message: `${successfulUploads.length} images uploaded successfully`,
      imageUrls: successfulUploads
    });

  } catch (error) {
    console.error('Multiple Upload Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Multiple image upload failed',
      error: error.message
    });
  }
};

module.exports = {
  uploadImageToS3,
  uploadMultipleImages
};
