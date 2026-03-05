class Findr < Formula
  desc "Terminal UI meta-search client with plugin architecture"
  homepage "https://github.com/lucaArchidiacono/findr"
  version "0.1.0"
  license "GPL-3.0-only"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/lucaArchidiacono/findr/releases/download/v#{version}/findr-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/lucaArchidiacono/findr/releases/download/v#{version}/findr-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/lucaArchidiacono/findr/releases/download/v#{version}/findr-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/lucaArchidiacono/findr/releases/download/v#{version}/findr-linux-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  def install
    Dir.glob("findr-*").each do |f|
      bin.install f => "findr"
    end
  end

  test do
    assert_predicate bin/"findr", :executable?
  end
end
