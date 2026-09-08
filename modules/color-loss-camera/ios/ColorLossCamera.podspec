Pod::Spec.new do |s|
  s.name = 'ColorLossCamera'
  s.version = '1.0.0'
  s.summary = 'On-device filtered camera for DMZ Scuba'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'DMZ Scuba'
  s.homepage = 'https://dmzscuba.com'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.frameworks = 'AVFoundation', 'CoreImage', 'UIKit'
end
