require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# libdivecomputer sources are staged here (gitignored) by
# scripts/stage-libdivecomputer.js / the withLibDiveComputer config plugin,
# because CocoaPods only compiles source_files that live inside the pod root.
libdc = 'libdivecomputer'

Pod::Spec.new do |s|
  s.name           = 'DiveComputerBridge'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'LGPL-2.1'
  s.author         = 'DMZ Scuba'
  s.homepage       = 'https://dmzscuba.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = [
    '*.{h,m,swift}',
    'generated/**/*.h',
    "#{libdc}/include/libdivecomputer/*.h",
    "#{libdc}/src/*.{c,h}",
  ]
  # Only our shim is public API; libdivecomputer's headers stay project-internal
  # so they never land in the module umbrella.
  s.public_header_files = 'DCLibdivecomputer.h'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # config.h (generated/) is consumed by the C sources via HAVE_CONFIG_H.
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) HAVE_CONFIG_H=1',
    'HEADER_SEARCH_PATHS' => [
      '$(inherited)',
      '"$(PODS_TARGET_SRCROOT)/generated"',
      "\"$(PODS_TARGET_SRCROOT)/#{libdc}/include\"",
      "\"$(PODS_TARGET_SRCROOT)/#{libdc}/src\"",
    ].join(' '),
    # Vendored C predates a lot of modern clang warnings; don't fail the build on them.
    'GCC_WARN_INHIBIT_ALL_WARNINGS' => 'YES',
  }
end
