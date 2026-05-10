# studex/validators.py
"""
File upload validators for security
"""
import os
from django.core.exceptions import ValidationError
from django.conf import settings
from django.utils.deconstruct import deconstructible

# Try to import python-magic for MIME type validation (optional)
try:
    import magic
    HAS_MAGIC = True
except ImportError:
    HAS_MAGIC = False


@deconstructible
class FileValidator:
    """
    Comprehensive file validator for uploads
    Validates file size, extension, and MIME type
    """

    def __init__(
        self,
        max_size_mb=None,
        allowed_extensions=None,
        allowed_mimetypes=None,
        message=None
    ):
        self.max_size_mb = max_size_mb or getattr(settings, 'MAX_UPLOAD_SIZE_MB', 10)
        self.allowed_extensions = allowed_extensions
        self.allowed_mimetypes = allowed_mimetypes
        self.message = message

    def __call__(self, file):
        """Validate the uploaded file"""
        # Validate file size
        max_size_bytes = self.max_size_mb * 1024 * 1024  # Convert MB to bytes
        if file.size > max_size_bytes:
            raise ValidationError(
                f'File size exceeds {self.max_size_mb}MB limit. '
                f'Your file is {file.size / (1024 * 1024):.2f}MB.'
            )

        # Get file extension
        ext = os.path.splitext(file.name)[1][1:].lower()

        # Validate extension
        if self.allowed_extensions and ext not in self.allowed_extensions:
            raise ValidationError(
                f'File extension ".{ext}" is not allowed. '
                f'Allowed extensions: {", ".join(self.allowed_extensions)}'
            )

        # Validate MIME type using python-magic (if available)
        if self.allowed_mimetypes and HAS_MAGIC:
            try:
                # Read first 2048 bytes to determine MIME type
                file.seek(0)
                file_content = file.read(2048)
                file.seek(0)  # Reset file pointer

                mime = magic.Magic(mime=True)
                detected_mime = mime.from_buffer(file_content)

                if detected_mime not in self.allowed_mimetypes:
                    raise ValidationError(
                        f'File type "{detected_mime}" is not allowed. '
                        f'This may be a security risk.'
                    )
            except Exception as e:
                # If magic fails, at least we validated extension
                pass
        elif self.allowed_mimetypes and not HAS_MAGIC:
            # python-magic not available, rely on extension validation only
            # Log warning in production
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                'python-magic not installed. MIME type validation skipped. '
                'Install with: pip install python-magic-bin (Windows) or pip install python-magic (Linux/Mac)'
            )

        return file


# Predefined validators for common file types
def validate_image(file):
    """Validate image uploads (jpg, jpeg, png, gif, webp)"""
    allowed_extensions = getattr(
        settings,
        'ALLOWED_IMAGE_EXTENSIONS',
        'jpg,jpeg,png,gif,webp'
    ).split(',')

    allowed_mimetypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ]

    validator = FileValidator(
        max_size_mb=getattr(settings, 'MAX_UPLOAD_SIZE_MB', 10),
        allowed_extensions=allowed_extensions,
        allowed_mimetypes=allowed_mimetypes
    )

    return validator(file)


def validate_id_document(file):
    """Validate ID card / NIN uploads — accepts images AND PDFs.

    Checks applied in order:
    1. Hard 10MB size limit
    2. Extension whitelist (jpg, jpeg, png, pdf)
    3. PDF magic-bytes header (%PDF-)
    4. MIME type via python-magic when available
    """
    import logging
    logger = logging.getLogger(__name__)

    _MAX_SIZE = 10 * 1024 * 1024  # 10MB
    _ALLOWED_EXT = {'jpg', 'jpeg', 'png', 'pdf'}
    _ALLOWED_MIME = {'image/jpeg', 'image/png', 'application/pdf'}

    if file.size > _MAX_SIZE:
        logger.warning(
            "[security] id_doc rejected: size=%d name=%s", file.size, file.name
        )
        raise ValidationError(
            f"File size exceeds 10MB. Your file is {file.size / (1024 * 1024):.1f}MB."
        )

    ext = os.path.splitext(file.name)[1][1:].lower()
    if ext not in _ALLOWED_EXT:
        logger.warning(
            "[security] id_doc rejected: ext=.%s name=%s", ext, file.name
        )
        raise ValidationError(
            f'File type ".{ext}" is not allowed. Use JPG, PNG, or PDF.'
        )

    # Read the first 8 bytes to check file signature
    file.seek(0)
    header = file.read(8)
    file.seek(0)

    if ext == 'pdf' and not header.startswith(b'%PDF-'):
        logger.warning(
            "[security] id_doc rejected: invalid PDF header name=%s", file.name
        )
        raise ValidationError(
            'File does not appear to be a valid PDF (bad file header).'
        )

    if HAS_MAGIC:
        mime_checker = magic.Magic(mime=True)
        file.seek(0)
        detected = mime_checker.from_buffer(file.read(2048))
        file.seek(0)
        if detected not in _ALLOWED_MIME:
            logger.warning(
                "[security] id_doc rejected: mime=%s name=%s", detected, file.name
            )
            raise ValidationError(
                f'File content type "{detected}" is not permitted.'
            )

    return file


def validate_document(file):
    """Validate document uploads (pdf, doc, docx)"""
    allowed_extensions = getattr(
        settings,
        'ALLOWED_DOCUMENT_EXTENSIONS',
        'pdf,doc,docx'
    ).split(',')

    allowed_mimetypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    validator = FileValidator(
        max_size_mb=getattr(settings, 'MAX_UPLOAD_SIZE_MB', 10),
        allowed_extensions=allowed_extensions,
        allowed_mimetypes=allowed_mimetypes
    )

    return validator(file)


def sanitize_filename(filename):
    """
    Sanitize filename to prevent directory traversal attacks
    Removes dangerous characters and path separators
    """
    import re
    import unicodedata

    # Normalize unicode characters
    filename = unicodedata.normalize('NFKD', filename)
    filename = filename.encode('ascii', 'ignore').decode('ascii')

    # Remove path separators and dangerous characters
    filename = re.sub(r'[^\w\s.-]', '', filename)
    filename = re.sub(r'[\\/]', '', filename)

    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')

    # Limit length
    max_length = 255
    name, ext = os.path.splitext(filename)
    if len(filename) > max_length:
        filename = name[:max_length - len(ext)] + ext

    return filename or 'unnamed'
