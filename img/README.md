# Image Assets Folder

This folder contains logo and profile images for the Great Solomon SCIM system.

## Expected Files

### Company Logo
- **Filename**: `logo.png` (or `logo.svg` for vector format)
- **Recommended Size**: 48x48px for sidebar, 100x100px for login page
- **Format**: PNG with transparency or SVG for scalability
- **Usage**: Company branding in sidebar and login page

### User Profile Images
- **Filename**: `profile-default.png` (default profile image)
- **Recommended Size**: 100x100px
- **Format**: PNG with transparency
- **Usage**: Default user avatar when no custom profile image is uploaded

## Current Implementation

### Text-Based Placeholder
Currently, the system uses text-based placeholders:
- **Company Logo**: "GS" in a colored box
- **User Profile**: User initials (e.g., "AU") in a colored circle

### To Switch to Images

1. **Replace Text Logo with Image** in sidebar HTML:
   ```html
   <!-- Current -->
   <div class="logo-icon">GS</div>
   
   <!-- With Image -->
   <img src="img/logo.png" alt="Great Solomon Logo" class="logo-icon">
   ```

2. **Replace User Initials with Profile Image**:
   ```html
   <!-- Current -->
   <div class="w-9 h-9 rounded-full ...">AU</div>
   
   <!-- With Image -->
   <img src="img/profile-default.png" alt="User Profile" class="w-9 h-9 rounded-full ... user-profile-img">
   ```

3. **Update Login Page Logo**:
   ```html
   <!-- Current -->
   <div class="logo-icon">GS</div>
   
   <!-- With Image -->
   <img src="img/logo.png" alt="Great Solomon Logo" class="logo-icon">
   ```

## CSS Classes

The following CSS classes are already defined in `styles.css`:

```css
.logo-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.user-profile-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.company-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

## Design Guidelines

### Company Logo
- Use your company's official logo
- Ensure good contrast with white backgrounds
- Consider both light and dark theme compatibility
- Vector format (SVG) recommended for scalability

### Profile Images
- Use square aspect ratio (1:1)
- Consider using a professional headshot placeholder
- Ensure faces are centered for circular cropping
- PNG format with transparency for smooth edges

## Future Enhancements

### Dynamic Profile Images
To implement user-specific profile images:

1. **Database Schema**: Add `profile_image` column to `users` table
2. **API Endpoint**: Add image upload endpoint to `/api/v1/users/{id}/profile`
3. **Frontend**: Update profile display to show uploaded images
4. **Storage**: Store images in this folder with user-specific filenames

### Example Implementation:
```javascript
// In user profile section
if (user.profile_image) {
  profileImage.src = `img/${user.profile_image}`;
} else {
  profileImage.textContent = user.initials;
}
```

## File Naming Convention

For user-specific profile images:
- Format: `profile-{user_id}.{ext}`
- Example: `profile-1.png`, `profile-2.jpg`
- Ensure unique filenames for each user

## Security Considerations

- Validate uploaded image types (JPG, PNG, SVG only)
- Limit file size (e.g., max 2MB)
- Sanitize filenames to prevent path traversal
- Consider storing image paths in database, not actual files
- Implement proper access controls for image downloads