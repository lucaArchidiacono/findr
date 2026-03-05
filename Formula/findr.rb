class Findr < Formula
  desc "Terminal UI meta-search client with plugin architecture"
  homepage "https://github.com/lucaArchidiacono/findr"
  version "0.1.0"
  license "GPL-3.0-only"

  on_macos do
    url "https://github.com/lucaArchidiacono/findr/releases/download/v#{version}/findr-darwin-arm64.tar.gz"
    sha256 "PLACEHOLDER"
  end

  on_linux do
    url "https://github.com/lucaArchidiacono/findr/releases/download/v#{version}/findr-linux-x64.tar.gz"
    sha256 "PLACEHOLDER"
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
