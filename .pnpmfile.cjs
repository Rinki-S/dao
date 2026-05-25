function readPackage(pkg) {
  if (pkg.name === 'shadcn' && pkg.dependencies?.zod) {
    pkg.dependencies.zod = '3.25.76';
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
