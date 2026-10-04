module.exports = {
  hooks: {
    beforePacking(pkg) {
      if (pkg.name === "silvery") delete pkg.patchedDependencies
      return pkg
    },
  },
}
