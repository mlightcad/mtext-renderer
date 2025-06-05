export const getExtension = (url: string) => {
  return url.substring(url.lastIndexOf('.') + 1);
};

export const getFileName = (url: string) => {
  return url.split('/').pop();
};

export const getFileNameWithoutExtension = (url: string) => {
  const fileName = getFileName(url);
  if (fileName) {
    // Find the last dot to separate the extension, if any
    const dotIndex = fileName.lastIndexOf('.');

    // If no dot is found, return the file name as is
    if (dotIndex === -1) {
      return fileName;
    }

    // Otherwise, return the part before the last dot (file name without extension)
    return fileName.substring(0, dotIndex);
  }
  return url;
};
