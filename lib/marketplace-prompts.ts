interface ListingInfo {
  title: string;
  description: string;
  price: number;
  condition: string;
  category: string;
  photos: string[];
}

export const MERCARI_PROMPTS = {
  checkLogin: `Check if I am logged in to Mercari. Look for a user profile icon, avatar, or username in the header/navigation. If I see a "Log in" or "Sign up" button, I am NOT logged in. Return whether the login was successful and any username visible.`,

  fillBasicFields: (listing: ListingInfo) =>
    `On this Mercari create listing page, fill in the following fields:
- Set the listing title/name to: "${listing.title}"
- Set the description to: "${listing.description}"
- Set the price to: ${listing.price}
Do not submit the form yet. Just fill in these text fields.`,

  uploadPhotos: (photoUrls: string[]) =>
    `I need to upload photos to this listing. The photos are available at these URLs:
${photoUrls.map((url, i) => `${i + 1}. ${url}`).join("\n")}
Find the photo upload area on the form and upload these images. You may need to click an "Add photos" button or drag-and-drop area first.`,

  setCategoryAndCondition: (listing: ListingInfo) =>
    `On this listing form, set the following:
- Condition: Select "${listing.condition}" (or the closest match like "Like new", "Good", "Fair", "Poor")
- Category: Search for and select the category closest to "${listing.category}"
If there's a shipping option, choose the simplest/cheapest one. Do not submit yet.`,

  submitListing: `Click the "List" or "Submit" or "Publish" button to submit this listing. Wait for the page to confirm the listing was created.`,

  getListingUrl: `The listing should now be created. Find and return the URL of the newly created listing. Look in the address bar or for a "View listing" link. Return just the URL.`,
};

export const FACEBOOK_PROMPTS = {
  checkLogin: `Check if I am logged in to Facebook. Look for a profile picture, notification bell, or my name in the header. If I see a login form, I am NOT logged in. Return whether the login was successful.`,

  fillBasicFields: (listing: ListingInfo) =>
    `On this Facebook Marketplace create listing page, fill in the following:
- Set the title to: "${listing.title}"
- Set the price to: ${listing.price}
- Set the description to: "${listing.description}"
If there's a condition dropdown, select "${listing.condition}".
If there's a category field, search for "${listing.category}".
Do not submit the form yet.`,

  uploadPhotos: (photoUrls: string[]) =>
    `Upload photos to this Facebook Marketplace listing. The photos are at these URLs:
${photoUrls.map((url, i) => `${i + 1}. ${url}`).join("\n")}
Find the photo upload button or area and add these images.`,

  submitListing: `Click "Publish" or "Post" to submit this listing to Facebook Marketplace. Wait for confirmation.`,

  getListingUrl: `The listing should now be posted. Find and return the URL of the newly created Facebook Marketplace listing.`,
};
